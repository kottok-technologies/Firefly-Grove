# Privacy policy publication

Developer: Kottok Technologies. Privacy/deletion contact: kottok.technologies@gmail.com (confirmed by the developer).

Public URL after the matching API deployment:

https://www.kottok-technologies.com/games/fireflygrove/privacy-policy.html

The same page includes an externally accessible deletion-request section at:

https://www.kottok-technologies.com/games/fireflygrove/privacy-policy.html#delete-data

`web/privacy-policy.js` is the canonical, static policy. The existing AWS Lambda bundles and serves it without authentication, database access, scripts or external assets. The custom domain uses a dedicated DNS-validated ACM certificate, a regional API Gateway domain with a `games/fireflygrove` mapping, a new www alias in the verified existing Route 53 zone, and exact GET/HEAD routes. Terraform manages only the new records, not the zone or its existing mail records. The original API URL `https://w51xbjq2xa.execute-api.us-east-1.amazonaws.com/api/v1/privacy` remains an alternate endpoint. It is publicly readable HTML rather than a PDF or an authenticated document. `GET` and `HEAD` are supported. The packaged Settings reader uses exactly the same policy content and works offline.

After editing the canonical content, run `node scripts/sync-privacy.mjs` to refresh `web/privacy.html`. CI rejects a stale offline copy. The API update must pass CI and CodeQL, then go through the existing reviewed Terraform plan/apply workflow and required production approval. Leave `build_release` unchecked: publishing the policy does not require an APK/AAB or a version bump. Confirm the live page returns HTTP 200, contains the correct email and policy date, and can be read without a login before entering the URL in Play Console. Existing installed APKs gain the Settings reader only after a requested app update.

## Handling deletion requests

The page provides a public email-based request process. Settings displays the server-issued Player ID once registered, falling back to the device's local ID before online registration. Ask the requester for that ID and username, never a password, bearer token or Google OAuth token. Verify ownership with the minimum information necessary before any deletion. Do not treat a public username or tag alone as sufficient proof.

A verified online deletion needs to cover the player's profile and token-hash authentication record; player-partition race/active records and permanent heart-credit receipts; and associated daily race/heart scores and ranking rows. Maintain the affected ranking totals consistently. This document does not implement or authorize an automatic destructive deletion command. Record completion and explain any necessary legal/security retention. Operational logs expire after 30 days; point-in-time database backups can retain earlier records for up to 35 days. Daily data has a 92-day TTL and asynchronous physical cleanup.

Deleting local storage is separate from deleting the AWS profile or Google Saved Games. Explain that the requester should stop cloud syncing on all devices and manage the game's Google-held data in Google Play Games/account controls so an old snapshot does not restore the profile. Do not delete a user's Google account. Support emails contain personal information and should be handled only by authorized support staff.

## Before Play submission

Ensure the Play Data safety answers match actual app and SDK behavior. Google Play Games has its own analytics/diagnostics collection even though no separate developer analytics or live ad SDK is installed. Target-audience/Families declarations are separate from this policy. Review the policy when adding ads, analytics, new data fields or new retention practices; do not silently rely on this version for those changes.

References:

- https://support.google.com/googleplay/android-developer/answer/10144311
- https://developer.android.com/games/pgs/data-collection
- https://developer.android.com/games/pgs/savedgames
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html
