output "state_bucket" { value = aws_s3_bucket.state.id }
output "state_kms_key_arn" { value = aws_kms_key.state.arn }
output "plan_role_arn" { value = aws_iam_role.github_plan.arn }
output "apply_role_arn" { value = aws_iam_role.github_apply.arn }
output "runtime_boundary_arn" { value = aws_iam_policy.runtime_boundary.arn }
output "backend_config" {
  value = {
    bucket  = aws_s3_bucket.state.id, key = local.state_key, region = local.region
    encrypt = true, use_lockfile = true, kms_key_id = aws_kms_key.state.arn
  }
}
