# k-ID Core Android integration (test)

## Implemented in source

The Android app requires API 31+, compiles/targets API 36, and uses Kotlin/Compose 2.2.20 with core-ui 1.0.0 from Maven Central. MainActivity is now a ComponentActivity with one native Compose root. KIDCoreProvider wraps KIDSessionProvider(AUTO) and the all-in-one KIDAgeGate. The game WebView is created only by the pass slot. Pending, prohibited, failure and connection-error screens have explicit copy and retry actions.

Android build resources select the public Kai key and API URL. Debug and signed sideload builds use the test environment. The Play upload bundle (bundleStore) uses the live environment and stores its Kai session separately from test builds. **Add package/applicationId `com.fireflygrove.game` to that test key's Android app allowlist in Kai.**

Declared capabilities: leaderboard-and-rankings, public-profile (public display name/tag/scores), custom-username. There are no chat, voice, purchases, custom avatars, targeted ads or real-time multiplayer features to declare. Privacy policy uses the existing public developer URL; support is kottok.technologies@gmail.com. The 512px PNG game icon is packaged as file:///android_asset/assets/game-icon.png. The Terms of Service declaration points to https://www.kottok-technologies.com/games/fireflygrove/terms-of-service.html. Deploy the public page before distributing the updated app.

Private native preferences retain sessionId and challengeId across process restarts; settings requests keep a separate settingsChallengeId. The native preferences are outside game/cloud saves and Android backup is disabled. No DOB or parent email is copied into the game's save.

Settings → Privacy & permissions opens KIDSettings inside KIDSettingsProvider under the same core provider. KIDPermission displays capability status; the game bridge checks live SDK permissions for online actions and username edits. Play Games initialization moved out of Application startup and happens on cloud access after the gate. Private Google backup has no matching capability in this SDK catalog; it is not mapped to an unrelated chat/purchase permission. Google eligibility still applies.

## Backend claim boundary

- onClaim immediately persists the one-time token in a private native outbox, then POSTs it to our /api/v1/consent/claim. Native retry stops after ten minutes; uncertain one-use failures require a new age check.
- A random app-specific bearer credential travels as X-Firefly-Consent. Store builds prefix it with live. to select live Kai. The backend hashes the complete credential, so adding the prefix to a test credential cannot reuse a test receipt.
- The backend POSTs the token to /api/v1/client/claim on kai-api.test.k-id.com or kai-api.k-id.com using the matching server key. It conditionally saves only returned session/challenge IDs and a claim digest; repeated requests return an already-saved receipt without consuming the token again.
- onSession signals /consent/session without submitting an ID. The backend resolves its own stored challenge through challenge/get-status and accepts only PASS plus a valid returned sessionId.
- Every protected request fetches session/get using the saved sessionId, requires the relevant enabled permission and known PLAYER/GUARDIAN management, and binds the consent record to one player. New player creation and binding are one DynamoDB transaction. Username-disabled registration uses a generated server name.
- /consent/delete calls session/delete for the saved provider session, then removes its authorization record. This is provider-consent removal, **not a complete game-account erasure feature**. Full public score/name/account deletion remains part of release work.
- Permission failures, missing secret, provider errors and missing claim receipts do not authorize the new client. Claim/session IDs, claim tokens, keys and parent data are not logged.

The legacy hosted-CDK adapter is separate and is not used by this new Kai Core flow.

## Infrastructure and activation

Terraform changes are prepared, **not applied**:

1. Apply the reviewed bootstrap changes to create Secrets Manager secret **firefly-grove-production-kid-test** (customer KMS encryption, deletion protection via Terraform, no value in state) and extend the runtime boundary narrowly.
2. In the AWS console, put the raw `kgs_test_...` key from Kai in that secret's **plaintext** value. Do not put JSON wrappers around it. Do not paste it in chat, Git, Terraform variables, APKs or logs. No secret value has been supplied or verified.
3. Deploy the reviewed leaderboard Terraform plan. Lambda resolves KID_SECRET_ARN through Secrets Manager for test requests and KID_LIVE_SECRET_ARN for live requests. A server-only environment override uses KID_TEST_SECRET_KEY for test mode or KID_SECRET_KEY for live mode. The browser preview local server has no consent integration. The test secret must contain a test key. The store client uses the separate live secret and live API.
4. Test a configured, connected Android development build with synthetic adult/child scenarios: approval, denial, prohibition, timeout, restart while pending, restart with a session, permission changes, offline/reconnect, expired claim, missing key and account/cloud restoration. No end-to-end Kai test has been reported yet.
5. `kid_enforce` defaults to false for existing APK compatibility. Requests carrying X-Firefly-Consent always undergo server authorization. Headerless legacy clients and test consent remain supported during rollout. Enabling kid_enforce requires live consent for protected online actions. **This is a staged test integration, not full production consent enforcement.**
6. Before all-ages release: configure the backend for live Kai claims and provision the live server key separately from the test key; set the live product’s Terms of Service and Privacy Policy URLs in Kai; publish a privacy policy describing actual k-ID processing; register Play app-signing and sideload signing SHA-256 certificates; finish old-client migration/global enforcement, public-data revocation/deletion behavior, private cloud consent treatment and account eligibility review; test provider availability and current Families requirements. Ads remain parked.

No new version bump, signed release APK/AAB, AWS apply or advertising rollout is part of this source change.

## Validation

Debug compilation, Android lint and JVM unit tests passed. JavaScript coverage with DynamoDB Local passed all 116 tests (above 99% lines/statements). Tests cover claim receipts and replay, forged IDs, missing secrets, current permissions, revocation, API denial and concurrent atomic player/consent ownership. Both Terraform roots validate; each root's three mocked security tests pass. These checks do not substitute for a provider sandbox/device test.

## Activate live claims

1. Apply the reviewed bootstrap plan to create the encrypted Secrets Manager entry `firefly-grove-production-kid-live` in us-east-1 and allow the Lambda runtime boundary to read it.
2. In Secrets Manager, set its plaintext value to the raw Kai `kgs_live_…` server key. Keep the existing test secret for development. Terraform stores only secret metadata.
3. Deploy the reviewed leaderboard plan. Lambda reads the live key from `KID_SECRET_KEY` when injected by the server environment, or resolves `KID_LIVE_SECRET_ARN` from Secrets Manager in AWS. Only live credentials select that loader. A store build from before this change needs rebuilding to send the live credential prefix.
4. Test the store build on a device signed with a certificate registered in Kai. Review the legacy-client migration before enabling global live enforcement.
