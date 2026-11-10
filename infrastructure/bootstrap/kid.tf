# The value is entered by the operator in AWS Secrets Manager, never Terraform state.
resource "aws_secretsmanager_secret" "kid_test" {
  name                    = "${local.name}-kid-test"
  description             = "k-ID Kai test server key (kgs_test_), set out of band"
  kms_key_id              = aws_kms_key.service.arn
  recovery_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
output "kid_test_secret_arn" {
  value = aws_secretsmanager_secret.kid_test.arn
}

resource "aws_secretsmanager_secret" "kid_live" {
  name                    = "${local.name}-kid-live"
  description             = "k-ID Kai live server key (kgs_live_), set out of band"
  kms_key_id              = aws_kms_key.service.arn
  recovery_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
output "kid_live_secret_arn" {
  value = aws_secretsmanager_secret.kid_live.arn
}
