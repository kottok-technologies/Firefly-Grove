# Terraform deployment

Two roots manage the production leaderboard in **us-east-1**:

* `bootstrap/`: private versioned S3 state, rotating customer-managed KMS keys for state and production, GitHub OIDC trust, separate plan/apply IAM roles, and a permissions boundary for the Lambda runtime.
* `leaderboard/`: on-demand DynamoDB with PITR, customer-managed encryption and deletion protection; encrypted 30-day logs; a Node 24 ARM Lambda with published versions and a `live` alias; an HTTPS HTTP API with rate/burst limits; and CloudWatch error alarms.

The small Lambda ZIP uploads directly through Terraform. The old CloudFormation templates and deployment script have been removed. Terraform-managed data and state keys have `prevent_destroy`; DynamoDB also has AWS deletion protection. Routine deploys cannot destroy those resources. GitHub has no destroy workflow.

## Current status

Configuration, provider validation, mocked security tests and a local high/critical Trivy scan pass. A read-only bootstrap plan against the selected account proposes **15 additions, no changes and no deletions**, reusing that account's existing GitHub OIDC provider. **No Terraform apply has run.** Review `reports/bootstrap-plan.txt` locally; the binary plan is ignored at `infrastructure/bootstrap/bootstrap.tfplan`. Regenerate a plan whenever bootstrap configuration or account settings change.

Deployment is also gated on successful CI, successful CodeQL analysis, and no open high/critical CodeQL alerts. The existing Sites dependency audit and open high CodeQL finding must be resolved/reviewed before the application can deploy. Nothing bypasses those gates.

## One-time bootstrap (operator)

Use Terraform **1.15.8**, Node **24**, AWS CLI and GitHub CLI. Authenticate locally with `aws login` and `gh auth login` as needed. No AWS access keys belong in repository variables or secrets. Verify the account with `aws sts get-caller-identity`.

```sh
terraform -chdir=infrastructure/bootstrap init -lockfile=readonly
terraform -chdir=infrastructure/bootstrap plan \
  -var='aws_account_id=YOUR_12_DIGIT_ACCOUNT_ID' \
  -var='existing_oidc_provider_arn=arn:aws:iam::YOUR_12_DIGIT_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com' \
  -out=bootstrap.tfplan
# Review the full plan before this explicit resource-creation step:
terraform -chdir=infrastructure/bootstrap apply bootstrap.tfplan
node scripts/terraform-bootstrap-config.mjs --set-github-variables
```

Use a real account ID in place of the placeholders. In a new account without GitHub's OIDC provider, omit `existing_oidc_provider_arn`; otherwise reuse it, since AWS allows only one provider per URL. Shared existing OIDC-provider ownership stays with its original configuration. The subject prefix was read from this repository's OIDC API and includes immutable repository/owner IDs; recheck `gh api repos/kottok-technologies/Firefly-Grove/actions/oidc/customization/sub` if moving/forking the repository.

Bootstrap intentionally starts with **local state** because its remote state bucket does not exist yet. Keep a secure backup of `infrastructure/bootstrap/terraform.tfstate` and its backup; never commit them. It manages IAM and the state-storage foundation and must remain operator-managed. Application state uses S3, KMS, versioning and native S3 `.tflock` locking; no deprecated DynamoDB lock table is required.

The helper writes ignored `leaderboard/backend.hcl` and sets seven non-secret repository variables from the applied outputs: `AWS_ACCOUNT_ID`, `TF_STATE_BUCKET`, `TF_STATE_KMS_KEY_ARN`, `TF_PLAN_ROLE_ARN`, `TF_APPLY_ROLE_ARN`, `TF_RUNTIME_BOUNDARY_ARN`, `TF_SERVICE_KMS_KEY_ARN`. Without `--set-github-variables`, it prints those variables for manual configuration.

In GitHub repository **Settings → Environments**, create `production`, configure **required reviewers**, and restrict deployments to `main`. Until that protection exists, the apply-request preflight refuses deployment. This task does not silently create a GitHub environment without approval rules. Restrict who can change Actions workflows and protect `main` with the CI checks documented in `.github/PIPELINE.md`.

## Normal deployment

1. Push changes to `main`; all CI checks and both CodeQL analyses must succeed. High/critical CodeQL alerts must be resolved or reviewed and dismissed with an appropriate reason. Do not dismiss a real issue to unblock deployment.
2. After successful CI, **Terraform deployment** generates a saved plan using the plan role. You can also dispatch that workflow with an empty `plan_run_id` after checks finish. Missing bootstrap variables leave deployment disabled. If CodeQL is still running when CI completes, manually request a plan once both have finished.
3. Download `terraform-production-plan` and review `plan.txt`. The artifact contains the binary plan, exact Lambda ZIP and integrity manifest; it expires after **24 hours**. Plans contain infrastructure metadata and may contain sensitive values if future configuration adds them: keep secrets out of Terraform variables/artifacts and review access accordingly.
4. Dispatch **Terraform deployment** again with the successful **plan workflow run ID** in `plan_run_id`. Required production-environment reviewers approve the apply job.
5. Before AWS credentials are requested, the job verifies the workflow/run/repository, manifest, package checksums, account/backend configuration, current `main` commit, age and CI/security status. It applies the **same saved binary plan**; it never replans inside the apply job. An intervening commit or stale state requires a new reviewed plan.
6. Health and database checks generate `deployed-leaderboard-config`. The workflow then builds `firefly-grove-connected-apk` with that endpoint. Both are Actions artifacts; no source-branch write or Play Store release occurs.

The plan role can read production resource configuration and acquire/release the exact state lock; it cannot mutate application resources or write application state. The apply role can write the exact application state and manage project-scoped services; it cannot create KMS keys or change key policies. Production encryption keys remain operator-managed in bootstrap. HTTP API IDs are AWS-generated, so API Gateway management is region-wide for HTTP APIs in `us-east-1`; several AWS list/describe APIs and X-Ray ingestion require wildcard resource scope. The Lambda role has a fixed permissions boundary so editable inline runtime policies cannot expand it to account administration. Review these policies before bootstrap.

Apply is deliberately **manual** and deployment runs are serialized without cancellation. The native S3 lock is a second safeguard. Plan/apply use short-lived GitHub OIDC credentials with exact subject/audience conditions; no long-lived AWS credentials are stored in GitHub.

## Local validation (no AWS resources)

```sh
npm ci --prefix aws-leaderboard
npm run build --prefix aws-leaderboard
terraform fmt -check -recursive infrastructure
terraform -chdir=infrastructure/bootstrap init -backend=false -lockfile=readonly
terraform -chdir=infrastructure/bootstrap validate
terraform -chdir=infrastructure/bootstrap test
terraform -chdir=infrastructure/leaderboard init -backend=false -lockfile=readonly
terraform -chdir=infrastructure/leaderboard validate
terraform -chdir=infrastructure/leaderboard test
```

Mocked tests use no AWS credentials and create no cloud resources. Provider selections and Windows/Linux checksums are committed. When switching an initialized directory from mock checks to real state, use `terraform init -reconfigure -backend-config=backend.hcl` in the leaderboard directory.

For operator-led application plans, build the bundle, set `TF_VAR_aws_account_id`, `TF_VAR_runtime_boundary_arn` and `TF_VAR_service_kms_key_arn`, and initialize with the generated backend configuration. The same account allowlist and data protections apply.

## Operations and cost

There is no always-on server or NAT gateway. AWS charges for API/Lambda/DynamoDB usage, backups, logs, detailed metrics and alarms, and the two bootstrap-managed customer-managed KMS keys. These are not a zero-cost or hard-budget-capped deployment. API throttles limit requests but are not a billing cap. Error alarms are visible in CloudWatch; notification destinations and AWS Budgets should be configured separately before broad release.

Each deploy publishes a Lambda version and moves `live` to it. For rollback, revert the source change and create a new reviewed Terraform plan; do not edit the alias out-of-band and leave state drift. Data/schema migrations require their own compatibility/backup review. Bootstrap state, application state and player data are separate; rolling back Lambda code does not roll back player data.

The connected APK is debug-signed on GitHub's ephemeral runner. It may not upgrade a locally debug-signed install; uninstalling clears local game/profile data. Store release signing and Play distribution remain separate work.
