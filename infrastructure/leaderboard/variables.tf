variable "aws_region" {
  type    = string
  default = "us-east-1"
  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "This production configuration is scoped to us-east-1."
  }
}
variable "aws_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Set the expected 12-digit AWS account ID."
  }
}
variable "runtime_boundary_arn" {
  description = "Permissions boundary created by the bootstrap root."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/firefly-grove-production-runtime-boundary$", var.runtime_boundary_arn))
    error_message = "Use the Firefly Grove runtime boundary output from bootstrap."
  }
}
variable "request_rate" {
  type    = number
  default = 50
  validation {
    condition     = var.request_rate >= 1 && var.request_rate <= 500
    error_message = "API request rate must be between 1 and 500 requests/second."
  }
}
variable "service_kms_key_arn" {
  description = "Fixed production encryption key created by the operator bootstrap."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:kms:us-east-1:[0-9]{12}:key/[a-f0-9-]{36}$", var.service_kms_key_arn))
    error_message = "Use the production KMS key ARN output from bootstrap."
  }
}
variable "request_burst" {
  type    = number
  default = 100
  validation {
    condition     = var.request_burst >= 1 && var.request_burst <= 1000 && floor(var.request_burst) == var.request_burst
    error_message = "API burst must be an integer from 1 to 1000."
  }
}
