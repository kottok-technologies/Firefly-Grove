# Rewarded ads: parked pending k-ID

Last updated: November 6, 2026 (America/Chicago).

**User instruction:** park ad rollout until k-ID is set up. Preserve the existing implementation and test artifacts. Do not resume provider setup, infrastructure deployment, production ad rollout, or new APK/AAB builds without the user resuming this work. Public version remains `0.1.0`, Android versionCode `27`; do not bump versions for routine edits.

## Completed

- Integrated native AdMob rewarded ads for one hint, one firefly reveal, or one journey life. One Rewarded ad unit serves all three actions. No rewarded interstitial, banner, app-open or forced ad placement is implemented.
- Rewards require the native earned-reward callback; early dismissal, no fill and failures grant nothing. Replies are correlated and one-shot. Pending loading is cancelled when leaving/backgrounding; a displayed ad retains its reward session. Local inventory is not server-attested.
- Added launch-time UMP privacy handling and the Settings privacy-options entry point where required. SDK initialization/ad loading occurs after the explicit Watch video action and UMP permission check.
- Applied child-directed ad treatment and G content filtering to all users. Publisher personalization and publisher first-party ID are disabled. Advertising ID and Privacy Sandbox advertising permissions were removed and checked in the merged manifest.
- Public AdMob IDs configured in ignored `android/ads.properties` and GitHub repository variables `ADMOB_APP_ID` / `ADMOB_REWARDED_ID`:
  - App: `ca-app-pub-5076756795473141~5832427434`
  - Rewarded unit: `ca-app-pub-5076756795473141/1596622776`
- Debug always uses Google's test rewarded unit. Release normally uses the configured unit. The phone-test release build explicitly overrode its unit with `ca-app-pub-3940256099942544/5224354917`; changing that build's environment did not change production IDs.
- User completed European and US-state AdMob privacy-message/settings setup through the screenshot walkthrough. User was told to publish draft messages after the updated policy deployment; actual publication/account settings have not been independently verified. Do not assume messages are published.
- Deployed the advertising privacy policy via reviewed Terraform plan `41132548170` and protected production apply `41132741381`. Apply succeeded; public GET/HEAD returned 200 and HTML matched the reviewed source, including AdMob, child treatment, contact and deletion information.
  - Public URL: https://www.kottok-technologies.com/games/fireflygrove/privacy-policy.html
  - Plan had 0 additions, 2 in-place updates (Lambda package/live alias), 0 deletions. No APK/AAB job was requested for the policy deployment.
- Fixed a launch crash: `putPublisherFirstPartyIdEnabled(false)` was called before `MobileAds.initialize`. Reproduced the exact IllegalStateException in emulator Logcat, moved the call into the initialized callback before ad loading, and verified the corrected debug app remained open with existing progress. Android tests/lint passed; replacement phone APK's persistent release certificate and packaged test unit were verified.

## Phone tests reported by the user

Performed using Google test inventory and the corrected APK:

| Scenario | Result |
| --- | --- |
| Complete test ad; earn one hint | Confirmed |
| Early dismissal; no reward | Confirmed |
| Extra-life ad | Confirmed: one life on the same puzzle, marks preserved |
| Airplane mode / no available ad | Confirmed: unavailable message, return to game, no reward |
| Restore connectivity and retry | Confirmed |
| Background during ad, return and complete | Confirmed stable; no duplicate ad/reward |
| Close/skip control works | Confirmed |
| Dismissal within five seconds | **Not explicitly timed/confirmed.** The user said dismissal works. Retain as pending until timing is measured. |
| Successful completed firefly-reveal reward | Not separately confirmed; the reveal action was used for the early-dismissal check. Test success explicitly before release. |
| Production ad inventory | Not tested; test-ad behavior is not proof of production creative behavior. |

## k-ID progress and blocker

- November 6 follow-up: user supplied a public Core test key and authorized the all-in-one native gate and server claim flow. These are now implemented in source with permission settings and Terraform-managed test-secret storage. Read `docs/KID_ANDROID.md` for current status: secret value, deployment, Kai allowlisting and sandbox/device validation are still pending; production/global enforcement and ad rollout are not activated. Earlier bullets below are historical.


- November 6: user resumed SDK installation only and approved Android 12+ support. Added `com.k-id:core-ui:1.0.0`; native consent UI, initialization, permission enforcement and ad rollout remain pending. See `docs/PARENTAL_CONSENT.md` for Core SDK/Kai setup requirements.

- User selected **verified parental consent for children's online features**, rather than making children permanently local-only, and selected **k-ID** as the provider. Do not replace this decision with an adult-only design without discussing it.
- Reviewed the existing app and found automatic AWS profile registration, Play Games startup initialization, public freeform usernames, background heart uploads and cloud-restored online credentials. These are not yet gated by age/parental permissions. Existing tokens/cloud saves are not proof of consent.
- Prepared and pushed an isolated server-only k-ID adapter for hosted end-to-end URL generation, widget status and current session permissions; raw-body timestamped HMAC verification; and feature permission checks. Focused adapter tests reached 100% coverage; lint and CI configuration validation passed locally.
- **The adapter is not imported by the production handler.** There is no active consent flow, provider secret, consent endpoint/record, parent UI, native enforcement or revocation handler. No k-ID infrastructure has been deployed.
- Compliance Studio signup led the user to neimo (regulatory research). Verified current k-ID documentation says an organization is provisioned by a k-ID representative; do not repeat the earlier assumption that product setup is self-service.
- User completed the k-ID demo/access request, selecting **Compliance age adaptation across markets (CDK)** and **Parental consent, family controls (Family Connect)**. Waiting for k-ID to respond with access, onboarding and applicable pricing. No sandbox test or live provider verification has occurred.
- Kai's advertised self-service allowance must not be assumed to apply to the CDK product required by the prepared adapter. Confirm product capabilities and commercial terms during onboarding.

## Remaining work, in resume order

1. Obtain the k-ID response. Confirm Compliance Studio organization, a Firefly Grove Test Mode product, hosted verified parental consent, session/permission management, parent review/revocation, supported markets and pricing. User handles registration and terms acceptance. Share public product IDs/permission names only; never paste keys, parent documents or card data into chat.
2. Configure exact provider permission scopes for public ranking participation, public profile/name features and optional cloud linking. Keep advertising child-protective regardless of consent. A parent approval must not unlock unrelated processing; Google account eligibility still applies separately.
3. Implement AWS consent flow and authorization, binding a provider widget/session to its own pending request/player. Check current permissions server-side; never authorize from a client redirect, local age choice, cached token or a widget PASS alone. Implement signed/idempotent webhooks and refresh for permission changes, revocation, unlink/deletion; define score/name/data removal and retention behavior.
4. Add player/parent flow and native enforcement. Prevent unknown/unapproved users from account SDK initialization, AWS registration, name publishing, score upload and cloud linking through every normal/background path. Migrate existing installations and prevent backup restoration from granting consent. Keep local puzzles, progress and daily practice usable while permission is pending or unavailable. Do not substitute an arithmetic gate or email checkbox for verified consent.
5. Manage any AWS routes, storage, secret references and narrow permissions with Terraform. Provider secrets belong in secure server storage, not app assets or GitHub public variables. Review the saved production plan and retain the required human GitHub production approval; never approve or bypass that gate as the agent.
6. Update and redeploy the privacy policy to describe k-ID and the actual new flow/data handling. The currently deployed advertising policy does not establish that k-ID is integrated. Complete accurate Play Console Target audience, Contains ads, Data safety and IARC answers; verify current exact SDK Families status.
7. Resume tests: completed reveal reward, explicitly measured five-second dismissal, clean/repeat launch, and end-to-end consent approval/denial/revocation across restart, offline operation and cloud restoration. Validate production Families ad inventory before rollout without clicking live ads for testing. No app-owned fake close overlay over SDK content.
8. Complete AdMob app readiness/app-ads.txt verification. Publish the exact account-provided app-ads.txt entry through a reviewed website/Terraform change; no app-ads.txt hosting change is recorded as completed.
9. Only build a new signed test/release artifact when requested or at an agreed milestone. Do not upload the existing test APK as a production monetization build.

## Files, commits and artifacts

- `docs/ADS.md`: ad integration/configuration and release checks.
- `docs/FAMILIES_REVIEW.md`: engineering review and selected consent direction.
- `docs/PARENTAL_CONSENT.md`: provider onboarding and intended architecture. Read with this handoff: organization access requires a representative.
- `android/app/src/main/java/com/fireflygrove/game/RewardAds.java`: native rewarded adapter and startup fix.
- `web/reward-bridge.js`, `web/app.js`: correlated native replies and inventory updates.
- `aws-leaderboard/src/kid-client.mjs`, `tests/kid-client.test.mjs`: isolated provider foundation, not an active consent system.
- Commits: `22975a9` AdMob integration; `31ed391` k-ID adapter/review; `ef7b165` startup fix.
- Corrected phone-test APK: `artifacts/FireflyGrove-0.1.0-ad-test-startup-fix.apk`.
  - SHA-256: `0DE4B15952DA132330C7E411EED63BC28240884F9056B77597641F83B6AFA032`
  - Version 0.1.0/code 27, persistent release signature, verified existing AWS endpoint, Google test rewarded unit.
- Earlier `artifacts/FireflyGrove-0.1.0-ad-test.apk` crashes on launch; do not redistribute it. Preserve it only as a historical reproduction artifact.
- Artifacts are local/ignored, not committed. `.codex-remote-attachments/` is unrelated user attachment storage and must not be committed or removed.

## Resume trigger

The user says k-ID access is ready and asks to resume. Read this handoff first, confirm the product capabilities/permission names and current source/CI state, then continue the integration. No further advertising rollout work is authorized while the task remains parked.
