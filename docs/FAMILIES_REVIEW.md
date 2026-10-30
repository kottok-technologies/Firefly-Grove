# All-ages implementation review

Reviewed October 30, 2026 against the current application and Google's published Families requirements. This is an engineering review, not a certification or a determination of every jurisdiction's legal requirements.

## Implemented advertising protections

- Native AdMob requests use child treatment and a General audience maximum for every player, including unknown ages and adults.
- Publisher personalization and publisher first-party identifiers are disabled. The merged Android manifest was checked to exclude Advertising ID and Privacy Sandbox advertising permissions.
- Ads require an explicit Watch video action. Free restarts and earned milestone tools remain available. Rewards require the native earned callback and cannot be awarded twice by repeating the same reply.
- The privacy policy describing advertising was deployed through the protected Terraform workflow and verified at the public URL on October 30.
- The developer has completed AdMob privacy message/settings setup. Console screenshots informed the walkthrough; actual account-wide settings and published message delivery still require end-to-end verification.

## Gaps found in existing online features

1. `web/app.js` calls `profiles.ensureOnline()` at launch and on connectivity restoration. This registers a pseudonymous AWS profile without an explicit online-feature choice. Existing credentials also allow background score uploads.
2. `FireflyApplication.onCreate()` initializes Play Games whenever its project ID is configured. Existing Google profiles can therefore authenticate before a player has selected an audience category or requested cloud linking.
3. Settings permits freeform public usernames. The public leaderboard displays those names. There is no age screen, parental control, or child-specific restriction on those features.
4. `heartsManager` queues and uploads completed journey records, including when the app returns to the foreground. Hiding ranking buttons alone would not stop this processing.
5. Cloud saves can restore an online identity and pending records from another device. Any audience/permission decision must remain device-local and must not be granted by importing that save.

An age screen alone is not verified parental consent. A parental-consent implementation would need an appropriately designed verification, withdrawal and child-data handling process. Do not represent a simple checkbox, arithmetic challenge or age declaration as that verification.

## Release decisions and verification still needed

- The developer selected a verified parental-consent flow for children's online features using k-ID. Account/product configuration and flow integration are pending; see PARENTAL_CONSENT.md. No parental verification or age restriction has been enabled by this review.
- Gate actual API and native SDK operations, including background paths, rather than only UI controls. Migrate existing installations without treating existing tokens or cloud backups as audience approval.
- Provide a neutral age screen if using audience separation, with no adult choice preselected or incentive to claim an older age. Retain only the minimum category needed locally; do not upload a birth date.
- Confirm on-device that unknown/child players cannot initialize account services, register an AWS identity or upload scores through normal flows, including restart, connectivity changes and old save restoration.
- Test actual rewarded ad presentation and the Families five-second dismissal requirement, all reward types, early close, no fill, offline conditions, backgrounding and loading cancellation. Compilation and simulated native callbacks do not establish those device behaviors.
- Verify the exact ad SDK version's current Families status and the app's Play Console audience, Data safety, Contains ads and content-rating answers before submission. Review app-ads.txt and app readiness in AdMob.
- Check any updated policy wording and redeploy it through the protected workflow when the implemented audience flow changes.

Sources:

- [Google Play Families Policies](https://support.google.com/googleplay/android-developer/answer/9893335)
- [AdMob Families implementation guidance](https://support.google.com/admob/answer/6223431)
- [Families self-certified ads SDKs](https://support.google.com/googleplay/android-developer/answer/12955712)
- [Google Play Games terms](https://developer.android.com/games/pgs/terms)
- [UMP under-age treatment](https://developers.google.com/admob/android/privacy/gdpr)

## Selected implementation direction: verified parental consent

Keep journey puzzles, daily practice and local saves available without online consent. Treat unknown or unapproved users as restricted for online features. Existing leaderboard tokens and cloud backups must not be treated as proof of consent.

Use a provider-hosted verification and permission flow. The app must not collect identity documents, card details or verification selfies. A hosted completion page or client-side success event is not sufficient to enable online access: the AWS backend must obtain and validate the provider result through an authenticated server API or authenticated webhook, bind it to the correct pending request and player, and record the approved feature scopes and notice version. Store verification references and necessary permission records, not raw verification documents.

Gate leaderboard registration, name publishing, race submissions, journey-heart uploads and cloud linking separately. Approval of one feature must not imply approval of advertising personalization, unrelated tracking or every other online feature. Ad requests retain the existing child-protective treatment regardless of parental consent.

Use signed webhook validation and replay protection, plus provider status refresh before sensitive operations, to process revocation and feature changes. A parent must be able to review permissions, withdraw consent and request deletion. Revocation stops future processing and must invalidate server authorization; merely hiding the UI is insufficient. Define how existing public scores and private backups are handled, including provider-held data and recovery backups.

Google Play Games linking must still obey Google's own account eligibility and SDK rules. A third-party parental approval cannot override a platform restriction. Do not promise that every child can use Google cloud saves until the real child-account flow is validated.

Use Terraform for any new AWS routes, records, secret references and narrowly scoped permissions. Keep vendor secrets out of APK assets, JavaScript and GitHub public variables. Provider registration, terms acceptance and production secret entry are developer actions; test fixtures or a development-only mock must never create production consent grants.

The developer selected k-ID (hosted verification, permissions and revocation callbacks). Product access, pricing and applicable terms still need review during developer onboarding. No account or paid service has been activated by this source change.
