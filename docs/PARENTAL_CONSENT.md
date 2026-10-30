# k-ID parental consent integration

The developer selected k-ID on October 30, 2026 to allow children's online features through verified parental consent rather than restricting children to local play permanently.

## Current status

The isolated server adapter in `aws-leaderboard/src/kid-client.mjs` implements authenticated k-ID calls for hosted end-to-end flow creation, widget status and current session permissions. It also provides raw-body HMAC authentication for webhook requests and a feature-permission predicate. Automated tests cover forged URLs, session mismatch, unknown states, Safe Start-style restricted permissions, malformed provider responses, signature tampering and expired timestamps.

**This is preparatory code, not an active parental-consent flow.** It is not imported by the production handler. No new routes, consent records, SDK gating or parent UI have been deployed. Existing online behavior has not been changed by adding this module. No verification service has been provisioned or paid for, and no k-ID credentials have been stored. Do not ship an all-ages release on the assumption that parental consent is already enforced.

## Developer onboarding needed

1. Open [k-ID Compliance Studio](https://portal.k-id.com/). Register/sign in yourself and review the service agreement, privacy terms and applicable pricing. Confirm access to the **CDK end-to-end parental consent widget, sessions and feature permissions**, not only an age-check product. Kai and CDK offerings may have different configuration/pricing; do not assume one product's published free allowance applies to the other.
2. Create a product for **Firefly Grove**, Android package `com.fireflygrove.game`, developer **Kottok Technologies**, with intended audience children and adults. Use the actual regions of availability. Use **Test Mode** initially.
3. Configure a data notice with the actual online functions: generated persistent player identity; public display name, tag and rankings; race/journey completion records; and optional Google cloud backup. Explain which data is public, retention/deletion, and how parents review or revoke permissions. Use the public policy URL as the policy reference. The policy will need another update describing k-ID before this flow is released.
4. Configure separate permission mappings for public leaderboard participation, public profile/name features and optional account/cloud linking using the permission names/types actually supported by your product. Record their **exact public permission names**. Do not enable unrelated chat, purchases, targeted advertising or tracking permissions. If the product cannot represent a required scope, resolve this during onboarding rather than silently mapping it to an unrelated permission.
5. Share the **public product ID, enabled product capabilities and permission names** in the development chat. Do **not** paste API keys, webhook secrets, documents or card information here. We will prepare secret storage and the Terraform configuration once the product is available. Generate the test API key/webhook secret in the product's Developer Settings and enter them through the agreed secure storage path; do not place secrets in Git, APK assets or public repository variables.

## Intended player and server flow

- Journey play and offline daily practice remain accessible before online consent. The hosted flow collects age/jurisdiction and any needed parent verification; the game does not collect identity documents, payment verification details or selfies.
- The backend starts the hosted flow and binds its `widgetId` to a random pending authorization record with a protected request credential. A client must not be able to submit an unrelated widget/session ID and claim ownership.
- Android opens the provider page in a system browser surface, separate from the locked-down game WebView. A redirect or JavaScript event is only a UI signal. The backend polls the saved widget ID through the authenticated k-ID API, then retrieves the session's current permissions. A widget `PASS` alone never enables all features; Safe Start can still have restricted permissions.
- Only approved feature scopes enable registration, publishing a name, submitting scores or linking cloud services. Server checks apply to API operations, and native checks apply to Play Games initialization and cloud requests. Existing tokens and imported backups do not count as consent.
- Signed webhook events trigger idempotent status refresh and permission invalidation. The adapter's signature check is not a complete webhook handler: it still needs replay/idempotency storage, bound session lookup and current-state refresh. Process permission changes, revocation, unlink and deletion. Never restore access from an older event.
- Parent-facing permission management and deletion must be implemented. Define how removing access affects already public names/scores, stored profiles and Google/provider backups. The provider's adult verification does not itself prove that every requested game permission was granted.
- Availability failures and unknown status keep affected online features unavailable while preserving local progress. Ad treatment remains child-protective even after parental consent. Google account eligibility must still be respected.

## Remaining work before activation

After account/product configuration, wire the adapter into a server-authorized consent workflow, add DynamoDB records and conditional updates, add native permission gating and system-browser handoff, add player/parent UI, and validate revocation across restart/offline/cloud restoration. Provision AWS resources and secret references with Terraform and use the existing protected production approval gate. Keep test and production keys/endpoints separate. Test with synthetic data in the provider's sandbox first; mocks never authorize production users.

Sources checked October 30, 2026:

- [Hosted end-to-end flow](https://docs.k-id.com/cdk/embedded-flow)
- [Authentication](https://docs.k-id.com/api/authentication/)
- [Generate widget](https://docs.k-id.com/api/endpoints/generate-e-2-eurl)
- [Widget status](https://docs.k-id.com/api/endpoints/get-widget-status)
- [Current session](https://docs.k-id.com/api/endpoints/get-session)
- [Webhooks](https://docs.k-id.com/events/webhooks/overview)
- [Test mode](https://docs.k-id.com/concepts/testing)
- [Session permissions and revocation](https://docs.k-id.com/get-started/quickstart-guides/managing-sessions-permissions)
