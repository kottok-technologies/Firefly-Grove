mock_provider "aws" {
  override_during = plan
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-1111-1111-1111-111111111111", key_id = "11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/firefly-grove-production-runtime" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111111111111:log-group:/firefly-grove/production/test" }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:us-east-1:111111111111:table/firefly-grove-production-scores" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:111111111111:function:firefly-grove-production-api", version = "1" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { execution_arn = "arn:aws:execute-api:us-east-1:111111111111:api-id" }
  }
}
variables {
  aws_account_id       = "111111111111"
  runtime_boundary_arn = "arn:aws:iam::111111111111:policy/firefly-grove-production-runtime-boundary"
}
run "production_security_defaults" {
  command = plan
  assert {
    condition     = aws_dynamodb_table.scores.deletion_protection_enabled && aws_dynamodb_table.scores.point_in_time_recovery[0].enabled && aws_dynamodb_table.scores.server_side_encryption[0].enabled
    error_message = "Production scores need deletion protection, PITR and encryption."
  }
  assert {
    condition     = aws_iam_role.runtime.permissions_boundary == var.runtime_boundary_arn
    error_message = "The runtime role must have the bootstrap permissions boundary."
  }
  assert {
    condition     = aws_lambda_function.api.runtime == "nodejs24.x" && aws_lambda_function.api.tracing_config[0].mode == "Active" && aws_lambda_alias.live.name == "live"
    error_message = "Use the supported runtime, tracing and a versioned live alias."
  }
  assert {
    condition     = aws_apigatewayv2_stage.production.default_route_settings[0].throttling_rate_limit == 50 && aws_apigatewayv2_stage.production.default_route_settings[0].throttling_burst_limit == 100
    error_message = "Production throttles must remain enabled."
  }
  assert {
    condition     = aws_lambda_permission.api.source_account == var.aws_account_id && endswith(aws_lambda_permission.api.source_arn, "/api/v1/*")
    error_message = "Invocation permission must restrict the account and API route."
  }
  assert {
    condition     = aws_kms_key.service.enable_key_rotation && aws_cloudwatch_log_group.api.retention_in_days == 30
    error_message = "Enable key rotation and bounded log retention."
  }
}
run "reject_unbounded_request_rate" {
  command = plan
  variables { request_rate = 10000 }
  expect_failures = [var.request_rate]
}
run "reject_wrong_boundary" {
  command = plan
  variables { runtime_boundary_arn = "arn:aws:iam::111111111111:policy/AdministratorAccess" }
  expect_failures = [var.runtime_boundary_arn]
}
