locals {
  privacy_domain  = "www.kottok-technologies.com"
  privacy_zone_id = "Z04953103Q1MLPH3O4LF5"
}

# The existing public zone remains outside this state. Manage only the new
# www alias and this certificate's DNS validation record; never adopt mail DNS.
data "aws_route53_zone" "privacy" {
  zone_id      = local.privacy_zone_id
  private_zone = false
  lifecycle {
    postcondition {
      condition     = trimsuffix(self.name, ".") == "kottok-technologies.com" && !self.private_zone
      error_message = "Privacy DNS must use the verified public Kottok Technologies zone."
    }
  }
}

# Avoid granting account-wide certificate tagging or deletion to the deployer.
# DNS validation permits automatic ACM renewal; replacement requires review.
resource "aws_acm_certificate" "privacy" {
  provider          = aws.stage
  domain_name       = local.privacy_domain
  validation_method = "DNS"
  lifecycle { prevent_destroy = true }
}

resource "aws_route53_record" "privacy_validation" {
  zone_id = data.aws_route53_zone.privacy.zone_id
  name    = one(aws_acm_certificate.privacy.domain_validation_options).resource_record_name
  type    = one(aws_acm_certificate.privacy.domain_validation_options).resource_record_type
  ttl     = 300
  records = [one(aws_acm_certificate.privacy.domain_validation_options).resource_record_value]
}

resource "aws_acm_certificate_validation" "privacy" {
  certificate_arn         = aws_acm_certificate.privacy.arn
  validation_record_fqdns = [aws_route53_record.privacy_validation.fqdn]
  timeouts { create = "15m" }
}

resource "aws_apigatewayv2_domain_name" "privacy" {
  domain_name = local.privacy_domain
  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.privacy.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "privacy" {
  api_id          = aws_apigatewayv2_api.leaderboard.id
  domain_name     = aws_apigatewayv2_domain_name.privacy.domain_name
  stage           = aws_apigatewayv2_stage.production.id
  api_mapping_key = "games/fireflygrove"
}

resource "aws_route53_record" "privacy_www" {
  zone_id = data.aws_route53_zone.privacy.zone_id
  name    = local.privacy_domain
  type    = "A"
  alias {
    name                   = aws_apigatewayv2_domain_name.privacy.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.privacy.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# HTTP API v2 removes the mapping prefix from rawPath before invoking Lambda.
resource "aws_apigatewayv2_route" "privacy" {
  for_each  = toset(["GET", "HEAD"])
  api_id    = aws_apigatewayv2_api.leaderboard.id
  route_key = "${each.value} /privacy-policy.html"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "privacy" {
  statement_id   = "AllowPrivacyPolicyHttpApi"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.api.function_name
  qualifier      = aws_lambda_alias.live.name
  principal      = "apigateway.amazonaws.com"
  source_account = local.account_id
  source_arn     = "${aws_apigatewayv2_api.leaderboard.execution_arn}/*/*/privacy-policy.html"
}

output "privacy_policy_url" {
  value = "https://${local.privacy_domain}/${aws_apigatewayv2_api_mapping.privacy.api_mapping_key}/privacy-policy.html"
}
