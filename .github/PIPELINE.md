# CI and build artifacts

Every push and pull request runs `.github/workflows/ci.yml` and `codeql.yml`. Both support manual dispatch and run weekly so newly disclosed vulnerabilities are checked even without a code change.

| Check | What it verifies |
| --- | --- |
| Lint and repository checks | ESLint correctness rules for the game, AWS draft, scripts and tests; workflow YAML; immutable action pins; lockfile consistency; application version alignment; Gradle checksum; offline cache assets; shared puzzle sources |
| Tests and coverage | Node tests plus actual DynamoDB transactions against an isolated local emulator, with no AWS account or credentials; HTML/LCOV/JSON coverage and JUnit reports |
| Dependency audit | All three npm lockfiles, including development dependencies; high and critical findings fail the build |
| Secrets and infrastructure scan | Trivy scans the checked-out source for secrets and infrastructure misconfiguration; high and critical findings fail |
| CodeQL | Extended security queries for JavaScript/TypeScript and Java; findings are uploaded to GitHub code scanning |
| Review dependency changes | Pull requests fail when introducing high or critical dependency vulnerabilities |
| Lambda build | Locked installation, bundle generation, shared puzzle consistency, ZIP and SHA-256 artifact |
| Android build and lint | JDK 17, SDK 36, validated Gradle wrapper, debug APK compilation, Android lint, configured unit-test tasks and APK signature verification |
| Terraform validation and tests | Locked providers, formatting, provider validation and mocked security tests for bootstrap and production without cloud credentials |

CodeQL reports alerts through the repository Security tab; a successful analysis job means analysis completed, not that no alerts exist. `CI required checks` fails if any applicable CI job fails or is cancelled. To enforce merges, configure that status plus both CodeQL language checks as required branch/ruleset checks. This change does not change repository branch protection.

Artifacts remain downloadable from Actions for 14 days. APKs are debug-signed for testing; GitHub's ephemeral debug key differs from a local Android debug key, so an APK installed from one may require uninstalling the other (which clears local app data). These are build artifacts, not Play Store releases.

## Coverage

Coverage fails below **95% lines/statements, 90% functions, or 85% branches**, aggregated across the puzzle engine, daily timing, drag logic, AWS API, DynamoDB store, original SQLite API and saved-plan integrity guards. Browser DOM wiring, the service worker, generated/copied files, legacy Sites scaffolding and native Android code are outside this JavaScript coverage scope. Android currently has no native unit-test sources; running its unit-test task does not imply native test coverage.

The local DynamoDB test refuses non-loopback endpoints and uses dummy credentials directly, so it cannot write to your AWS account. CI runs every integration test; local `npm test` skips that one test unless `DYNAMODB_ENDPOINT` is set. A coverage run without the local database is expected to fail the DynamoDB coverage threshold.

```sh
npm ci
npm ci --prefix aws-leaderboard
npm run lint
npm run ci:validate
# Start AWS DynamoDB Local on port 8000, then:
DYNAMODB_ENDPOINT=http://127.0.0.1:8000 npm run test:coverage
```

On PowerShell, set `$env:DYNAMODB_ENDPOINT='http://127.0.0.1:8000'` before running the coverage command.

## Existing security debt

The original, undeployed `leaderboard-service/` Sites prototype remains in source. At pipeline creation, its lockfile contains **15 high and 1 critical** dependency findings (plus lower-severity findings). The root tools and AWS dependency lockfiles have no reported vulnerabilities. The legacy audit is deliberately blocking: there is no ignore list, baseline waiver or `continue-on-error`. Updating/removing that prototype is a separate follow-up.

The first infrastructure scan reported **AWS-0132 (high)** in the old CloudFormation artifact bucket. The CloudFormation templates and deployment script have now been removed. Terraform uses direct Lambda ZIP upload and a private, customer-KMS-encrypted state bucket. The replacement Terraform configuration has no high/critical findings in the local Trivy scan.

The first CodeQL analysis also reports [a high-severity DOM/HTML alert](https://github.com/kottok-technologies/Firefly-Grove/security/code-scanning/1) at the shared dialog renderer in `web/app.js`, and [a medium-severity origin-check alert](https://github.com/kottok-technologies/Firefly-Grove/security/code-scanning/2) for the dedicated generator worker. These are findings to review, not confirmed exploitability assessments. They have not been dismissed or suppressed. CodeQL analysis completed successfully for both languages; review the Security tab separately from the analysis job status.

## Deployment

Quality CI never changes cloud resources. The separate **Terraform deployment** workflow is described in [infrastructure/README.md](../infrastructure/README.md). After operator-reviewed bootstrap, it uses separate OIDC plan/apply roles, creates a saved plan after successful CI, and requires explicit manual apply plus production-environment reviewers. It rejects stale/modified plans and open high/critical CodeQL alerts. It checks the deployed API and builds a connected debug APK; it does not publish to the Play Store. Missing bootstrap variables disable deployment. No bootstrap apply or production deployment has run during implementation.

Dependabot opens weekly update PRs for Actions, npm packages and Gradle. Actions and the DynamoDB service image are pinned to immutable hashes; updates must pass these same checks.
