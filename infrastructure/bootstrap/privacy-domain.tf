locals {
  privacy_domain   = "www.kottok-technologies.com"
  privacy_zone_arn = "arn:aws:route53:::hostedzone/Z04953103Q1MLPH3O4LF5"
  privacy_cert_arn = "arn:aws:acm:${local.region}:${local.account_id}:certificate/*"
  privacy_api_arn  = "arn:aws:apigateway:${local.region}::/domainnames/${local.privacy_domain}"

  privacy_read_statements = [
    { Effect = "Allow", Action = ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ListTagsForResource"], Resource = local.privacy_zone_arn },
    { Effect = "Allow", Action = "route53:GetChange", Resource = "arn:aws:route53:::change/*" },
    { Effect = "Allow", Action = ["acm:DescribeCertificate", "acm:GetCertificate", "acm:ListTagsForCertificate"], Resource = local.privacy_cert_arn },
    { Effect = "Allow", Action = "apigateway:GET", Resource = [local.privacy_api_arn, "${local.privacy_api_arn}/*"] }
  ]
}

resource "aws_iam_role_policy" "privacy_plan" {
  name   = "read-privacy-domain"
  role   = aws_iam_role.github_plan.id
  policy = jsonencode({ Version = "2012-10-17", Statement = local.privacy_read_statements })
}

resource "aws_iam_role_policy" "privacy_apply" {
  name = "manage-privacy-domain"
  role = aws_iam_role.github_apply.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat(local.privacy_read_statements, [
    {
      Effect = "Allow", Action = "acm:RequestCertificate", Resource = "*"
      Condition = {
        StringEquals                = { "aws:RequestedRegion" = local.region, "acm:ValidationMethod" = "DNS" }
        "ForAllValues:StringEquals" = { "acm:DomainNames" = [local.privacy_domain] }
      }
    },
    {
      Effect = "Allow", Action = "route53:ChangeResourceRecordSets", Resource = local.privacy_zone_arn
      Condition = {
        "ForAllValues:StringLike"   = { "route53:ChangeResourceRecordSetsNormalizedRecordNames" = [local.privacy_domain, "_*.${local.privacy_domain}"] }
        "ForAllValues:StringEquals" = { "route53:ChangeResourceRecordSetsRecordTypes" = ["A", "CNAME"] }
      }
    },
    # API Gateway requires the collection ARN to create a new domain. The ACM
    # request and DNS writes are separately restricted to the requested hostname.
    { Effect = "Allow", Action = "apigateway:POST", Resource = "arn:aws:apigateway:${local.region}::/domainnames" },
    { Effect = "Allow", Action = ["apigateway:POST", "apigateway:PATCH", "apigateway:PUT", "apigateway:DELETE"], Resource = [local.privacy_api_arn, "${local.privacy_api_arn}/*"] }
  ]) })
}
