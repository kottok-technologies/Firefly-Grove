terraform {
  required_version = ">= 1.15.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]
  default_tags { tags = { Project = "firefly-grove", Environment = "bootstrap", ManagedBy = "Terraform" } }
}
