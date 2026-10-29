mock_provider "aws" {
  override_during = plan
  mock_data "aws_route53_zone" {
    defaults = { zone_id = "Z04953103Q1MLPH3O4LF5", name = "kottok-technologies.com.", private_zone = false }
  }
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
  service_kms_key_arn  = "arn:aws:kms:us-east-1:111111111111:key/11111111-1111-1111-1111-111111111111"
}
mock_provider "aws" {
  alias           = "stage"
  override_during = plan
  mock_resource "aws_acm_certificate" {
    defaults = {
      arn                       = "arn:aws:acm:us-east-1:111111111111:certificate/11111111-1111-1111-1111-111111111111"
      domain_validation_options = [{ domain_name = "www.kottok-technologies.com", resource_record_name = "_test.www.kottok-technologies.com.", resource_record_type = "CNAME", resource_record_value = "_test.acm-validations.aws." }]
    }
  }
}
run "production_security_defaults" {
  command = plan
  assert {
    condition     = aws_apigatewayv2_domain_name.privacy.domain_name == "www.kottok-technologies.com" && aws_apigatewayv2_domain_name.privacy.domain_name_configuration[0].security_policy == "TLS_1_2" && aws_apigatewayv2_api_mapping.privacy.api_mapping_key == "games/fireflygrove"
    error_message = "Privacy must use the requested HTTPS domain and exact path mapping."
  }
  assert {
    condition     = aws_route53_record.privacy_www.zone_id == "Z04953103Q1MLPH3O4LF5" && aws_route53_record.privacy_www.name == "www.kottok-technologies.com" && aws_acm_certificate.privacy.validation_method == "DNS"
    error_message = "Use the verified zone and only the new www alias plus certificate validation."
  }
  assert {
    condition     = toset([for route in aws_apigatewayv2_route.privacy : route.route_key]) == toset(["GET /privacy-policy.html", "HEAD /privacy-policy.html"]) && endswith(aws_lambda_permission.privacy.source_arn, "/privacy-policy.html") && aws_lambda_permission.privacy.source_account == var.aws_account_id
    error_message = "Only privacy GET/HEAD routes should receive the extra Lambda permission."
  }
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
    condition     = aws_cloudwatch_log_group.api.retention_in_days == 30 && aws_cloudwatch_log_group.api.kms_key_id == var.service_kms_key_arn
    error_message = "Use the fixed encryption key and bounded log retention."
  }
  assert {
    condition     = length(aws_apigatewayv2_stage.production.tags) == 0 && length(data.aws_default_tags.stage.tags) == 0
    error_message = "The stage must not require new tagging permissions; the parent API retains project tags."
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
