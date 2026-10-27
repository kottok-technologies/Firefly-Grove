terraform {
  required_version = ">= 1.15.0, < 2.0.0"
  backend "s3" {}
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = { Project = "firefly-grove", Environment = "production", ManagedBy = "Terraform" }
  }
}

# API Gateway v2 checks a separate tagging permission when CreateStage has
# tags. The stage does not need tags: its parent API carries project metadata.
# This provider keeps the existing deployment role unchanged.
provider "aws" {
  alias               = "stage"
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
}
