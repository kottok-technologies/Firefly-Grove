# Security review — 1.9.0

This change addresses the security findings identified during the first CI/CodeQL runs. It does not apply application infrastructure, grant advertising rewards, or change production deployment approval requirements.

| Finding | Change |
| --- | --- |
| Vulnerable Sites dependencies | Retired the unused, undeployed Sites/Cloudflare prototype, its lockfile/toolchain, copied engine and redundant SQLite tests. AWS is the selected backend; its API/transaction tests remain. Both active dependency audits report zero vulnerabilities. No audit ignore list or severity reduction was added. |
| `js/xss-through-dom` | All dialog markup is selected from packaged, static templates. Dynamic values, including DOM-derived timer text and saved progress, are assigned with `textContent`. Regression tests inject HTML, script, SVG and event-handler payloads into every dialog slot and verify inert text and intact controls. |
| `js/missing-origin-check` | The generator checks the message origin and validates the payload before generating a board. Dedicated-worker messages normally have an empty origin; a nonempty origin must exactly match the worker's creator origin. Messages from other origins, malformed modes, invalid levels and out-of-range seeds are rejected. |
| `java/android/webview-addjavascriptinterface` | Removed the unused Java bridge and `@JavascriptInterface` method completely. The no-ad-simulation decision uses the packaged origin. Version 1.9.0 introduces the narrowly scoped cloud message channel reviewed below; no generic Java object is exposed. |
| `js/file-access-to-http` | Event-file values no longer enter outbound URL paths or queries. A selected plan ID is matched locally against GitHub-returned run records. API traffic uses a fixed repository, an explicit read-endpoint allowlist and redirect rejection. Tests reject alternate hosts, paths, query injection and malformed IDs. |

## Required JavaScript in the Android shell

`java/android/websettings-javascript-enabled` reports that JavaScript is enabled. This is intentional: the puzzle engine, interactions and accessibility updates are JavaScript. Disabling it would make the app unusable. This generic warning is reviewed as an expected, mitigated use rather than hiding the call, disabling the query, excluding the Java file, or lowering the deployment gate's severity threshold.

The reviewed call site is constrained by all of the following:

* Initial navigation is a fixed APK asset URL. Further navigation requires the exact packaged HTTPS origin, expected path, no credentials, no alternate port and no path traversal.
* Both WebView and service-worker resource interception apply the same allowlist. Unknown packaged resources are denied instead of falling back to the network.
* The only allowed external requests are non-main-frame HTTPS calls to regional AWS API Gateway `/api/v1/` endpoints with allowed API methods. Arbitrary web pages cannot be loaded.
* Packaged responses carry CSP: scripts and workers are self-only; inline scripts, eval, remote scripts, frames, form navigation and base-tag changes are forbidden. Inline styling remains allowed for the existing grid styling; this does not enable inline script execution.
* File/content access, mixed content, popup windows and geolocation are disabled. The cloud-only message listener described below is limited to the packaged main frame. No @JavascriptInterface is exposed. WebView certificate validation remains intact.
* Three JVM tests exercise the actual URL/CSP policy, including origin-prefix confusion, credentials, alternate ports, wrong regions, encoded traversal, remote scripts and main-frame API navigation.

This matches the documented mitigation for necessary JavaScript: restrict loaded content to trusted sources over HTTPS. See [CodeQL's query guidance](https://codeql.github.com/codeql-query-help/java/java-android-websettings-javascript-enabled/) and [Android's native-bridge guidance](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges).

The single enablement warning may be triaged as a false positive for this constrained use after scan/build verification. This disposition applies only to this call site. Any future external page, native bridge, advertising SDK, CSP relaxation or new origin requires renewed review. Actual vulnerabilities must be fixed; alerts must not be dismissed merely to unblock deployment.

## Validation and limits

The 1.9.0 local suite has 83 passing Node tests, including actual DynamoDB Local transactions, cloud conflicts/restores and security regressions, with 100% line coverage and over 95% branch coverage across the explicitly configured JavaScript core. UI event wiring and Android runtime behavior are outside that coverage calculation. Native URL/CSP tests are separate JVM tests. Android compilation/lint and hosted CodeQL/security scans must also pass. Browser checks cover settings, reward dialogs and daily generation; device/emulator testing remains appropriate for the hardened shell.

Static scanning and these tests do not prove absence of all vulnerabilities. Keep dependency updates, weekly scans and the high/critical deployment gate enabled. Future rewarded ads must use an origin-restricted adapter and grant only on the native SDK's earned-reward callback; no live ad network is currently configured.

## Play Games cloud channel — 1.9.0

The pinned official Play Games v2 SDK handles native platform authentication and private snapshots. It uses native network requests; the WebView CSP and URL policy are unchanged. Snapshot transfers require explicit cloud linking. Unconfigured builds skip SDK initialization and remain playable as guests. Auto-triggered Play Games profile creation is suppressed.

WebViewCompat.addWebMessageListener allows only https://appassets.androidplatform.net. Every callback independently requires that exact source origin and isMainFrame. The capability accepts only status, read, write, adopt, cancel and disconnect; it has no URL navigation, filesystem, script evaluation, arbitrary native method, or backup deletion operation. Messages use correlated IDs, bounded payloads and request timeouts. Replies are JSON messages, never evaluated JavaScript. Native snapshot sessions prevent stale UI callbacks from writing a different open save; request epochs discard asynchronous callbacks after cancellation or destruction. Two JVM tests exercise the actual origin/main-frame and operation policies.

Web code validates the versioned snapshot schema, puzzle bounds, player fields, size limit and dangerous JSON property names before restoring. Only the current production profile and its queued heart submissions are exported; test profiles and active ranked-run tickets are omitted. The AWS guest credential is intentionally included in the private snapshot to recover the existing profile. No Google OAuth secret, access token or refresh token is sent through the WebView or stored in game state, and no snapshot or credential is logged. A PGS player ID is used only for local account-change detection, never as proof of identity to the AWS API.

Snapshots are opened with manual conflict resolution. Independent saves require a user choice, never max/summed tool balances, timestamp-only selection, or silent replacement. A failed local restore does not acknowledge the new cloud revision. Native account changes disable syncing until the player explicitly links again, including when the change is noticed during a manual sync or while a choice dialog is open; the SDK account is checked again before writing or adopting that snapshot. Disabling cloud saves stops future writes without deleting backups or changing the device profile. Existing server replay and per-level receipt deduplication remain authoritative for hearts.

Native compilation, lint, JVM policy tests and mocked web integration tests pass. Actual authentication, Google consent, offline reconciliation, and two-device snapshot restore must also be tested with the real Console project, correct signing certificate, and authorized tester accounts before distribution. These external checks cannot be replaced by mocks or a dummy project ID. Update the store privacy/Data safety disclosures for the SDK and opt-in backup before a public release.
