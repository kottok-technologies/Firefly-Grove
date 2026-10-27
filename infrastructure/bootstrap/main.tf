locals {
  name       = "firefly-grove-production"
  region     = "us-east-1"
  account_id = var.aws_account_id
  state_key  = "leaderboard/production.tfstate"
  oidc_arn   = var.existing_oidc_provider_arn != null ? var.existing_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  table_arn  = "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${local.name}-scores"
  lambda_arn = "arn:aws:lambda:${local.region}:${local.account_id}:function:${local.name}-api"
  role_arn   = "arn:aws:iam::${local.account_id}:role/${local.name}-runtime"
  logs_arn   = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/firefly-grove/production/*"

  read_statements = [
    { Effect = "Allow", Action = ["dynamodb:DescribeTable", "dynamodb:DescribeContinuousBackups", "dynamodb:DescribeTimeToLive", "dynamodb:ListTagsOfResource", "dynamodb:DescribeContributorInsights"], Resource = local.table_arn },
    { Effect = "Allow", Action = ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:GetFunctionCodeSigningConfig", "lambda:GetFunctionConcurrency", "lambda:GetPolicy", "lambda:GetAlias", "lambda:ListAliases", "lambda:ListVersionsByFunction", "lambda:ListTags"], Resource = [local.lambda_arn, "${local.lambda_arn}:*"] },
    { Effect = "Allow", Action = ["iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies"], Resource = local.role_arn },
    { Effect = "Allow", Action = ["iam:GetPolicy", "iam:GetPolicyVersion"], Resource = aws_iam_policy.runtime_boundary.arn },
    { Effect = "Allow", Action = ["apigateway:GET"], Resource = "arn:aws:apigateway:${local.region}::/apis/*" },
    { Effect = "Allow", Action = ["logs:DescribeLogGroups", "cloudwatch:DescribeAlarms", "cloudwatch:ListTagsForResource", "kms:ListAliases"], Resource = "*" },
    { Effect = "Allow", Action = ["logs:ListTagsForResource", "logs:ListTagsLogGroup"], Resource = local.logs_arn },
    {
      Effect    = "Allow", Action = ["kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus", "kms:ListResourceTags"], Resource = "arn:aws:kms:${local.region}:${local.account_id}:key/*"
      Condition = { StringEquals = { "aws:ResourceTag/Project" = "firefly-grove", "aws:ResourceTag/Environment" = "production" } }
    }
  ]
  state_statements = [
    { Effect = "Allow", Action = "s3:ListBucket", Resource = aws_s3_bucket.state.arn, Condition = { StringLike = { "s3:prefix" = [local.state_key, "${local.state_key}.tflock", "env:/"] } } },
    { Effect = "Allow", Action = "s3:GetObject", Resource = "${aws_s3_bucket.state.arn}/${local.state_key}" },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.state.arn}/${local.state_key}.tflock" },
    { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.state.arn }
  ]
}

resource "aws_kms_key" "state" {
  description             = "Firefly Grove Terraform state encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_kms_alias" "state" {
  name          = "alias/firefly-grove-terraform-state"
  target_key_id = aws_kms_key.state.key_id
}
resource "aws_s3_bucket" "state" {
  bucket        = "firefly-grove-tfstate-${local.account_id}-${local.region}"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
  }
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.existing_oidc_provider_arn == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# This boundary caps any policies the deployer can put on the Lambda role.
resource "aws_iam_policy" "runtime_boundary" {
  name = "${local.name}-runtime-boundary"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:BatchGetItem", "dynamodb:ConditionCheckItem"], Resource = local.table_arn },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${local.logs_arn}:*" },
      {
        Effect = "Allow", Action = ["kms:Decrypt", "kms:DescribeKey"], Resource = "arn:aws:kms:${local.region}:${local.account_id}:key/*"
        Condition = {
          StringEquals               = { "kms:ViaService" = "dynamodb.${local.region}.amazonaws.com" }
          "ForAnyValue:StringEquals" = { "kms:ResourceAliases" = "alias/${local.name}" }
        }
      },
      # X-Ray write APIs do not support resource-level permissions.
      { Effect = "Allow", Action = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"], Resource = "*" }
    ]
  })
}

resource "aws_iam_role" "github_plan" {
  name                 = "firefly-grove-terraform-plan"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Action = "sts:AssumeRoleWithWebIdentity", Principal = { Federated = local.oidc_arn }
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = "${var.github_oidc_subject_prefix}:ref:refs/heads/main"
      } }
    }]
  })
}
resource "aws_iam_role_policy" "github_plan" {
  name   = "read-production-and-lock-state"
  role   = aws_iam_role.github_plan.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat(local.read_statements, local.state_statements) })
}

resource "aws_iam_role" "github_apply" {
  name                 = "firefly-grove-terraform-apply"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Action = "sts:AssumeRoleWithWebIdentity", Principal = { Federated = local.oidc_arn }
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = "${var.github_oidc_subject_prefix}:environment:production"
      } }
    }]
  })
}
resource "aws_iam_role_policy" "github_apply" {
  name = "manage-production-leaderboard"
  role = aws_iam_role.github_apply.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(local.read_statements, local.state_statements, [
      { Effect = "Allow", Action = "s3:PutObject", Resource = "${aws_s3_bucket.state.arn}/${local.state_key}" },
      { Effect = "Allow", Action = ["dynamodb:CreateTable", "dynamodb:UpdateTable", "dynamodb:DeleteTable", "dynamodb:UpdateContinuousBackups", "dynamodb:UpdateTimeToLive", "dynamodb:TagResource", "dynamodb:UntagResource"], Resource = local.table_arn },
      { Effect = "Allow", Action = ["lambda:CreateFunction", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration", "lambda:DeleteFunction", "lambda:PublishVersion", "lambda:CreateAlias", "lambda:UpdateAlias", "lambda:DeleteAlias", "lambda:AddPermission", "lambda:RemovePermission", "lambda:TagResource", "lambda:UntagResource"], Resource = [local.lambda_arn, "${local.lambda_arn}:*"] },
      { Effect = "Allow", Action = "iam:CreateRole", Resource = local.role_arn, Condition = { StringEquals = { "iam:PermissionsBoundary" = aws_iam_policy.runtime_boundary.arn } } },
      { Effect = "Allow", Action = ["iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole"], Resource = local.role_arn },
      { Effect = "Allow", Action = "iam:PassRole", Resource = local.role_arn, Condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } } },
      # API Gateway generates API IDs: HTTP API operations must be region-wide.
      { Effect = "Allow", Action = ["apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE"], Resource = ["arn:aws:apigateway:${local.region}::/apis", "arn:aws:apigateway:${local.region}::/apis/*", "arn:aws:apigateway:${local.region}::/tags/*"] },
      { Effect = "Allow", Action = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy", "logs:AssociateKmsKey", "logs:DisassociateKmsKey", "logs:TagResource", "logs:UntagResource", "logs:TagLogGroup", "logs:UntagLogGroup"], Resource = [local.logs_arn, "${local.logs_arn}:*"] },
      { Effect = "Allow", Action = ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:TagResource", "cloudwatch:UntagResource"], Resource = "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name}-*" },
      { Effect = "Allow", Action = "kms:CreateKey", Resource = "*", Condition = { StringEquals = { "aws:RequestTag/Project" = "firefly-grove", "aws:RequestTag/Environment" = "production" } } },
      {
        Effect    = "Allow", Action = ["kms:PutKeyPolicy", "kms:EnableKeyRotation", "kms:DisableKeyRotation", "kms:UpdateKeyDescription", "kms:TagResource", "kms:UntagResource", "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion", "kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias"]
        Resource  = "arn:aws:kms:${local.region}:${local.account_id}:key/*"
        Condition = { StringEquals = { "aws:ResourceTag/Project" = "firefly-grove", "aws:ResourceTag/Environment" = "production" } }
      },
      { Effect = "Allow", Action = ["kms:CreateGrant", "kms:RevokeGrant", "kms:ListGrants"], Resource = "arn:aws:kms:${local.region}:${local.account_id}:key/*", Condition = { Bool = { "kms:GrantIsForAWSResource" = "true" } } },
      { Effect = "Allow", Action = ["kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias"], Resource = "arn:aws:kms:${local.region}:${local.account_id}:alias/${local.name}" }
    ])
  })
}
