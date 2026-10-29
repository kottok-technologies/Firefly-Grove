mock_provider "aws" {
  override_during = plan
  mock_resource "aws_s3_bucket" {
    defaults = { id = "firefly-grove-tfstate-111111111111-us-east-1", arn = "arn:aws:s3:::firefly-grove-tfstate-111111111111-us-east-1" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/11111111-1111-1111-1111-111111111111", key_id = "11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "aws_iam_role" {
    defaults = { id = "role-id", arn = "arn:aws:iam::111111111111:role/test" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111111111111:policy/firefly-grove-production-runtime-boundary" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  }
}
variables { aws_account_id = "111111111111" }
run "state_and_oidc_are_restricted" {
  command = plan
  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled" && aws_s3_bucket_public_access_block.state.block_public_policy && aws_s3_bucket_public_access_block.state.restrict_public_buckets
    error_message = "State must be versioned and private."
  }
  assert {
    condition     = alltrue([for rule in aws_s3_bucket_server_side_encryption_configuration.state.rule : rule.apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"])
    error_message = "State must use customer-managed KMS encryption."
  }
  assert {
    condition     = jsondecode(aws_iam_role.github_plan.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "${var.github_oidc_subject_prefix}:ref:refs/heads/main"
    error_message = "Plan credentials must only trust main in this exact repository."
  }
  assert {
    condition     = jsondecode(aws_iam_role.github_apply.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "${var.github_oidc_subject_prefix}:environment:production"
    error_message = "Apply credentials must require the production environment."
  }
  assert {
    condition     = alltrue([for statement in jsondecode(aws_iam_role_policy.github_plan.policy).Statement : !contains(flatten([statement.Action]), "s3:PutObject") || statement.Resource == "arn:aws:s3:::firefly-grove-tfstate-111111111111-us-east-1/leaderboard/production.tfstate.tflock"]) && !strcontains(aws_iam_role_policy.github_plan.policy, "iam:PassRole")
    error_message = "The plan role must not manage IAM roles or write production state."
  }
  assert {
    condition     = length(aws_iam_role_policy.github_apply.policy) + length(aws_iam_role_policy.privacy_apply.policy) <= 10240 && length(aws_iam_role_policy.github_plan.policy) + length(aws_iam_role_policy.privacy_plan.policy) <= 10240
    error_message = "AWS IAM inline role policy size limit exceeded."
  }
  assert {
    condition     = aws_kms_key.service.enable_key_rotation && !strcontains(aws_iam_role_policy.github_apply.policy, "kms:CreateKey") && !strcontains(aws_iam_role_policy.github_apply.policy, "kms:PutKeyPolicy")
    error_message = "Only the operator bootstrap can create production keys or edit key policies."
  }
  assert {
    condition = anytrue([for statement in jsondecode(aws_iam_role_policy.github_apply.policy).Statement : try(statement.Sid == "ApiGatewayAccessLogDelivery", false) && try(
      toset(statement.Action) == toset(["logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:DescribeResourcePolicies", "logs:PutResourcePolicy"]) && statement.Resource == "*" && statement.Condition.StringEquals["aws:RequestedRegion"] == "us-east-1", false
    )])
    error_message = "Access-log delivery needs only the documented CloudWatch delivery actions, restricted to us-east-1."
  }
}
run "privacy_domain_permissions_are_scoped" {
  command = plan
  assert {
    condition     = !strcontains(aws_iam_role_policy.privacy_plan.policy, "ChangeResourceRecordSets") && !strcontains(aws_iam_role_policy.privacy_plan.policy, "RequestCertificate")
    error_message = "The plan role must not mutate DNS or certificates."
  }
  assert {
    condition = anytrue([for statement in jsondecode(aws_iam_role_policy.privacy_apply.policy).Statement : try(
      statement.Action == "route53:ChangeResourceRecordSets" && statement.Resource == "arn:aws:route53:::hostedzone/Z04953103Q1MLPH3O4LF5" && toset(statement.Condition["ForAllValues:StringLike"]["route53:ChangeResourceRecordSetsNormalizedRecordNames"]) == toset(["www.kottok-technologies.com", "_*.www.kottok-technologies.com"]) && toset(statement.Condition["ForAllValues:StringEquals"]["route53:ChangeResourceRecordSetsRecordTypes"]) == toset(["A", "CNAME"]), false
    )])
    error_message = "DNS writes must stay restricted to the verified zone, www and certificate CNAMEs."
  }
  assert {
    condition = anytrue([for statement in jsondecode(aws_iam_role_policy.privacy_apply.policy).Statement : try(
      statement.Action == "acm:RequestCertificate" && statement.Condition.StringEquals["acm:ValidationMethod"] == "DNS" && toset(statement.Condition["ForAllValues:StringEquals"]["acm:DomainNames"]) == toset(["www.kottok-technologies.com"]), false
    )])
    error_message = "Certificate requests must be DNS-validated and limited to www.kottok-technologies.com."
  }
}

run "reuse_existing_github_provider" {
  command = plan
  variables { existing_oidc_provider_arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com" }
  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "Do not create duplicate account-level GitHub OIDC providers."
  }
}
