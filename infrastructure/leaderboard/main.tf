locals {
  name       = "firefly-grove-production"
  account_id = var.aws_account_id
  region     = var.aws_region
}

# No artifact bucket is needed: this small bundle uploads directly to Lambda.
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../../aws-leaderboard/dist/handler.mjs"
  output_path = "${path.module}/build/lambda.zip"
}

resource "aws_kms_key" "service" {
  description             = "Firefly Grove production leaderboard data and logs"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "AccountAdministration", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }, Action = "kms:*", Resource = "*" },
      {
        Sid       = "EncryptedCloudWatchLogs", Effect = "Allow", Principal = { Service = "logs.${local.region}.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"], Resource = "*"
        Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/firefly-grove/production/*" } }
      }
    ]
  })
  lifecycle { prevent_destroy = true }
}
resource "aws_kms_alias" "service" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.service.key_id
}

resource "aws_dynamodb_table" "scores" {
  name                        = "${local.name}-scores"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk"
  range_key                   = "sk"
  deletion_protection_enabled = true
  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  ttl {
    attribute_name = "expires"
    enabled        = true
  }
  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.service.arn
  }
  lifecycle { prevent_destroy = true }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/firefly-grove/production/lambda"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.service.arn
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/firefly-grove/production/api"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.service.arn
}

resource "aws_iam_role" "runtime" {
  name                 = "${local.name}-runtime"
  permissions_boundary = var.runtime_boundary_arn
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy" "runtime" {
  name = "leaderboard-runtime"
  role = aws_iam_role.runtime.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow", Resource = aws_dynamodb_table.scores.arn
        Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:BatchGetItem", "dynamodb:ConditionCheckItem"]
      },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.lambda.arn}:*" },
      {
        Effect    = "Allow", Action = ["kms:Decrypt", "kms:DescribeKey"], Resource = aws_kms_key.service.arn
        Condition = { StringEquals = { "kms:ViaService" = "dynamodb.${local.region}.amazonaws.com" } }
      },
      # X-Ray ingestion does not support resource-level IAM restrictions.
      { Effect = "Allow", Action = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"], Resource = "*" }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  description      = "Firefly Grove daily races and leaderboard"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  role             = aws_iam_role.runtime.arn
  handler          = "handler.handler"
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  memory_size      = 512
  timeout          = 10
  publish          = true
  environment { variables = { TABLE_NAME = aws_dynamodb_table.scores.name } }
  tracing_config { mode = "Active" }
  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.lambda.name
  }
  depends_on = [aws_iam_role_policy.runtime]
}
resource "aws_lambda_alias" "live" {
  name             = "live"
  function_name    = aws_lambda_function.api.function_name
  function_version = aws_lambda_function.api.version
}

resource "aws_apigatewayv2_api" "leaderboard" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_headers = ["content-type", "authorization"]
    allow_methods = ["GET", "POST", "PUT", "OPTIONS"]
    max_age       = 86400
  }
}
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.leaderboard.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_alias.live.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}
resource "aws_apigatewayv2_route" "api" {
  api_id    = aws_apigatewayv2_api.leaderboard.id
  route_key = "ANY /api/v1/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
resource "aws_apigatewayv2_stage" "production" {
  api_id      = aws_apigatewayv2_api.leaderboard.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_rate_limit    = var.request_rate
    throttling_burst_limit   = var.request_burst
    detailed_metrics_enabled = true
  }
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId = "$context.requestId", route = "$context.routeKey", status = "$context.status", latency = "$context.responseLatency"
    })
  }
}
resource "aws_lambda_permission" "api" {
  statement_id   = "AllowLeaderboardHttpApi"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.api.function_name
  qualifier      = aws_lambda_alias.live.name
  principal      = "apigateway.amazonaws.com"
  source_account = local.account_id
  source_arn     = "${aws_apigatewayv2_api.leaderboard.execution_arn}/*/*/api/v1/*"
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.name}-lambda-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  alarm_description   = "Five or more API Lambda failures in five minutes. Configure notification routing separately."
}
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${local.name}-http-5xx"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { ApiId = aws_apigatewayv2_api.leaderboard.id }
  alarm_description   = "Five or more HTTP 5xx responses in five minutes. Configure notification routing separately."
}
