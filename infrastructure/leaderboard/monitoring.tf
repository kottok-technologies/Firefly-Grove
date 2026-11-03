resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  for_each            = toset(["ReadThrottleEvents", "WriteThrottleEvents"])
  alarm_name          = "${local.name}-dynamodb-${each.key}"
  namespace           = "AWS/DynamoDB"
  metric_name         = each.key
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { TableName = aws_dynamodb_table.scores.name }
  alarm_description   = "Leaderboard database requests are being throttled. Configure notification routing separately."
}

resource "aws_cloudwatch_metric_alarm" "lambda_latency" {
  alarm_name          = "${local.name}-api-slow"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = 8000
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  alarm_description   = "API p95 duration exceeds eight seconds and approaches its ten-second timeout. Configure notification routing separately."
}
