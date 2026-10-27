variable "aws_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Set the expected 12-digit AWS account ID."
  }
}
variable "github_oidc_subject_prefix" {
  description = "Copy sub_claim_prefix from the repository OIDC customization API; do not guess the subject format."
  type        = string
  default     = "repo:kottok-technologies@30096565/Firefly-Grove@1435622163"
  validation {
    condition     = can(regex("^repo:kottok-technologies(@[0-9]+)?/Firefly-Grove(@[0-9]+)?$", var.github_oidc_subject_prefix))
    error_message = "Use this repository's exact OIDC subject prefix."
  }
}
variable "existing_oidc_provider_arn" {
  description = "Set when the account already has the GitHub OIDC provider. Only one provider per URL can exist in an account."
  type        = string
  default     = null
  validation {
    condition     = var.existing_oidc_provider_arn == null ? true : can(regex("^arn:aws:iam::[0-9]{12}:oidc-provider/token.actions.githubusercontent.com$", var.existing_oidc_provider_arn))
    error_message = "Use the ARN of the existing GitHub Actions OIDC provider."
  }
}
