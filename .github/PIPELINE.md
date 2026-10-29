# CI and build artifacts

Every push and pull request runs `.github/workflows/ci.yml` and `codeql.yml`. Both support manual dispatch and run weekly so newly disclosed vulnerabilities are checked even without a code change.

| Check | What it verifies |
| --- | --- |
| Lint and repository checks | ESLint correctness rules for the game, AWS backend, scripts and tests; workflow YAML; immutable action pins; lockfile consistency; application version alignment; Gradle checksum; offline cache assets; shared puzzle sources |
| Tests and coverage | Node tests plus actual DynamoDB transactions against an isolated local emulator, with no AWS account or credentials; HTML/LCOV/JSON coverage and JUnit reports |
| Dependency audit | Both active npm lockfiles, including development dependencies; high and critical findings fail the build |
| Secrets and infrastructure scan | Trivy scans the checked-out source for secrets and infrastructure misconfiguration; high and critical findings fail |
| CodeQL | Extended security queries for JavaScript/TypeScript and Java; findings are uploaded to GitHub code scanning |
| Review dependency changes | Pull requests fail when introducing high or critical dependency vulnerabilities |
| Lambda build | Locked installation, bundle generation, shared puzzle consistency, ZIP and SHA-256 artifact |
| Android build and lint | JDK 17, SDK 36, validated Gradle wrapper, debug APK compilation, Android lint, configured unit-test tasks and APK signature verification |
| Terraform validation and tests | Locked providers, formatting, provider validation and mocked security tests for bootstrap and production without cloud credentials |

CodeQL reports alerts through the repository Security tab; a successful analysis job means analysis completed, not that no alerts exist. `CI required checks` fails if any applicable CI job fails or is cancelled. To enforce merges, configure that status plus both CodeQL language checks as required branch/ruleset checks. This change does not change repository branch protection.

Artifacts remain downloadable from Actions for 14 days. Pull-request Android artifacts are development debug builds. Push CI does not create signed distribution builds. Manually run CI on main with `build_release` selected to build connected release APKs and Play upload bundles after the required checks pass, or run the separate Signed Android release workflow. Both use the persistent signing key. Local and CI release APKs share the certificate; earlier debug installs require a one-time migration. See [Android signing](../docs/ANDROID_SIGNING.md). Nothing is automatically published to Google Play.

## Coverage

Coverage fails below **95% lines/statements, 90% functions, or 85% branches**, aggregated across the puzzle engine, daily timing, drag logic, AWS API, DynamoDB store, dialog rendering, player profile lifecycle, journey hearts replay/queueing, worker protocol and deployment API guards and saved-plan integrity guards. Browser DOM wiring, the service worker, generated/copied files,  and native Android code are outside this JavaScript coverage scope. Android also runs JVM URL/CSP and cloud bridge origin/main-frame policy security tests; those tests are separate from the JavaScript coverage report.

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

The original Sites prototype, its lockfile and its unused toolchain have been removed. Both active npm dependency audits now report zero vulnerabilities; all remaining dependencies, including development tools, remain subject to the same blocking audit.

The first infrastructure scan reported **AWS-0132 (high)** in the old CloudFormation artifact bucket. The CloudFormation templates and deployment script have now been removed. Terraform uses direct Lambda ZIP upload and a private, customer-KMS-encrypted state bucket. The replacement Terraform configuration has no high/critical findings in the local Trivy scan.

The original DOM interpolation, missing worker-origin check, unused Java bridge and event-file HTTP-routing findings have code fixes and regression coverage. JavaScript remains necessary in the packaged Android game; its generic enablement warning is reviewed with strict origin/CSP restrictions rather than disabling game execution. See [the security review](../docs/SECURITY_REVIEW.md) for per-alert evidence and disposition.

## Deployment

Quality CI never changes cloud resources. The separate **Terraform deployment** workflow is described in [infrastructure/README.md](../infrastructure/README.md). After operator-reviewed bootstrap, it uses separate OIDC plan/apply roles, creates a saved plan after successful CI, and requires explicit manual apply plus production-environment reviewers. It rejects stale/modified plans and open high/critical CodeQL alerts. It checks the deployed API and builds a connected signed release APK and Play upload bundle; it does not publish to the Play Store. Signed distribution APKs and Play bundles use the persistent key described in [Android signing](../docs/ANDROID_SIGNING.md). Missing bootstrap variables disable deployment. Bootstrap has been applied: state storage, encryption keys and OIDC roles are configured, repository variables are saved, and the production environment requires review on main. The production application is deployed and the shared leaderboard has been tested across devices.

Dependabot opens weekly update PRs for Actions, npm packages, Gradle and Terraform. Actions and the DynamoDB service image are pinned to immutable hashes; updates must pass these same checks.

Cloud builds read the public PLAY_GAMES_PROJECT_ID repository variable as ANDROID_PLAY_GAMES_PROJECT_ID. It is not a signing secret or an OAuth secret. An unset variable produces a guest-capable build with cloud saving disabled; do not distribute it as a configured cloud release. See [Play Games setup](../docs/GOOGLE_PLAY_CLOUD.md).
