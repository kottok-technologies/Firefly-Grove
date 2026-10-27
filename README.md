# Firefly Grove

AWS infrastructure and reviewed deployments are managed with [Terraform](infrastructure/README.md). Bootstrap is applied and GitHub deployment is configured. Production application deployment remains gated by CI/security checks and explicit approval.

[![CI](https://github.com/kottok-technologies/Firefly-Grove/actions/workflows/ci.yml/badge.svg)](https://github.com/kottok-technologies/Firefly-Grove/actions/workflows/ci.yml)
[![CodeQL](https://github.com/kottok-technologies/Firefly-Grove/actions/workflows/codeql.yml/badge.svg)](https://github.com/kottok-technologies/Firefly-Grove/actions/workflows/codeql.yml)

Pushes and pull requests run lint, tests, enforced coverage, dependency/security scans, and Android/Lambda builds. See [.github/PIPELINE.md](.github/PIPELINE.md) for commands, coverage scope, artifacts, existing security findings and deployment boundaries.

A calm, original firefly-themed region puzzle for Android, with a mobile-only browser preview. No forced advertising, accounts, analytics, or paid dependencies.

## Play locally

Requires Node.js 24.12 or newer within Node 24. Playing locally needs no npm installation; CI lint and coverage tools require `npm ci`.

```sh
npm start
```

Open http://localhost:4173. The installable web app caches its assets for offline use after the first visit. Progress, tools, settings, and the current puzzle are saved on this device.

The interface uses one portrait phone layout at every screen size, capped at 480px wide for desktop previews. The landing screen provides Play/Continue, settings, help, tool inventory, and care package details. The puzzle screen fits the available viewport without page or board scrolling: its square grid resizes to the space left by the header, lives, tools, and compact status area. Long hint explanations are available through the expand button beside the status message. Tap always crosses a cell; double-tap finds a firefly. Return home with the back arrow; the timer pauses while at home. Native Android Back also returns from the puzzle to home. Native Android and installed-web manifests request portrait orientation. Device/browser support determines whether orientation locking is honored.

## Rules and progression

- Exactly one firefly per row, column, and connected colored region. Fireflies cannot touch, including diagonally.
- Single tap marks any unrevealed cell with a cross; tap again erases the cross. Crosses are reversible notes and never cost lives, even when covering a hidden firefly. Double tap finds a firefly, including on a crossed cell. Only an incorrect firefly placement costs one life. Starter fireflies cannot be erased.
- Tap-drag from an unmarked cell to paint crosses, or start on a cross to erase notes. The stroke keeps the same action until release, skips revealed fireflies, and never toggles a cell twice when you retrace it. Fast strokes fill cells between pointer samples. Dragging never places a firefly or spends a life, and releasing a drag does not count as a tap.
- Newly found fireflies pop into place with a wing flutter, glow, and expanding ring. Confirmed fireflies occasionally bob, wiggle, or flutter at randomized intervals. Crosses draw in with a dark stroke and a pale outline; erasing a cross fades it out. Board updates preserve cell nodes so unrelated moves do not restart animations. Idle movement pauses at home, while a dialog is open, and when the app is hidden. Reduced-motion preferences disable these animations.
- Three lives per attempt. Restart the same puzzle for free. No automatic ads between levels or on failure.
- Settings offer automatic crossing and vibration. Keyboard: Tab to a cell, Enter to cross, Shift+Enter to find. Right-click also finds.
- Levels 1–3 train on 4×4 boards with two starter fireflies. Levels 4–6 use 5×5 with one starter. Levels 7–9 use 6×6; 10–12 use 7×7; 13–22 use 8×8; 23–32 use 9×9; 33 onward use the maximum 10×10. Gentle, Thoughtful, and Challenging boards alternate after onboarding; region growth varies with difficulty. These are generation profiles, not calibrated human difficulty ratings.
- Start with 3 hints and 2 reveals. Every five completed levels awards 2 hints and 1 reveal, once. Restarting spends no additional tools and never refunds used tools.
- Hints explain the specific occupied row, column, color, or touching rule; the last position in a color; a color confined to one row/column; a row/column with only one color left; and sets of n colors confined to n rows/columns. One tool marks every affected unmarked cell for that deduction. Color swatches identify the regions in each explanation. Harder contradiction hints identify the exact row, column, or color left without a possible firefly after forced placements. Reveals expose one target.
- Correct player crosses support deductions. If crosses include a hidden firefly, hints ignore player crosses and explain this, so mistaken notes cannot cause false hint marks.

## Daily speed challenge

The landing screen offers one shared 8×8 puzzle for each UTC date, resetting at 00:00 UTC. The date seed is independent of installation and regular-level seeds. Each daily has a unique solution and no starter fireflies. The same app version generates the same board for everyone on that date.

Daily runs have three lives, free retries, and no hints, reveals, automatic crosses, or ad revives. The clock starts only after generation, then uses elapsed wall time, including time at home, in dialogs, in the background, or after closing and reopening the app. It stops at the final placement or loss. Restarting begins a new attempt on the same board. Completion updates the day's local personal best and finish count once per run. Replays can improve that best; this is a personal time trial, with no online leaderboard or account synchronization.

Daily progress is saved separately from regular levels; playing daily never advances regular milestones or spends tools. An in-progress daily from before midnight can still be completed for its original date, while the landing card offers the new day's puzzle. Times rely on the device clock and are not server-verified.

Daily browser checks used an isolated in-memory save: they covered no automatic crossing even when enabled in settings, switching to regular play and back with a continuously running daily clock, three-life loss and free retry, full completion, personal-best recording, and unchanged regular levels, tools, and milestones. The 8×8 daily fits a 320×568 viewport without page overflow. No test time was recorded in the player's real daily history.

## Procedural generation

Each installation has a random seed; each successive level derives a distinct seed from it. Completed/generated layouts are recorded locally and duplicate layouts are rejected. Targets are a row/column permutation with non-touching diagonals. Connected regions grow from those targets in a deduction order: every added non-target cell is ruled out by an earlier target. A constrained solver independently verifies the unique solution.

Every new puzzle has exactly 1–3 single-cell regions. The count is selected before generation retries: 85% one, 13% two, and 2% three, for an expected mean of 1.17. Other regions receive at least two cells. Growth favors smaller regions, and no region can exceed 1.8 times the average size of the non-singleton regions, rounded up. Generation never relaxes these constraints to finish a difficult batch.

Generation uses a module worker so larger boards do not freeze the screen. Generation times vary. The same level restarts with the same puzzle. When a saved active board has a size that no longer matches the revised progression, it is retained in `previousPuzzle` in local storage and a board of the new size is created on Play. The level, tool balances, and milestone progress are preserved. Different installations get different progressions; global uniqueness across devices is not guaranteed.

## Android build

Open `android/` in Android Studio. Use JDK 17 or later and Android SDK platform 36. The included Gradle wrapper pins Gradle 8.14.3 with Android Gradle Plugin 8.13.0. Set the local SDK path through Studio or an ignored `android/local.properties` file. Let Studio sync, then Run on an Android 8+ emulator or device, or Build APK(s). The Android build includes `web/` directly as its assets, served with AndroidX WebViewAssetLoader. No server is needed on the phone. Both compileSdk and targetSdk are 36; minSdk remains 26 (Android 8).

From the `android/` directory, run `./gradlew assembleDebug` (Windows: `gradlew.bat assembleDebug`). The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. This is a debug-signed build for sideloading and testing; a store release needs its own signing configuration. Android 13+ Back uses the platform's OnBackInvokedCallback, while older devices retain the legacy callback. See the [Android back-navigation guide](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture) and [AGP 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes).

The SDK 36 debug build was compiled successfully, Android lint completed with zero errors (six non-blocking warnings), and APK signature verification passed. Security release 1.4.1 removes unsafe dialog interpolation and the unused native bridge, validates worker messages, and restricts WebView content. Current CI produces a debug APK and test/security reports; see [the security review](docs/SECURITY_REVIEW.md) for scope and validation. The initial APK was emulator-tested by the user; subsequent updates have been browser-tested and still need emulator/device verification. Live reward ads remain unconfigured.

## Optional reward ads — integration still required

**No live ad network is connected.** Browser preview rewards are clearly labeled simulations. Android detects its packaged HTTPS origin, disables simulated rewards and reports videos unavailable. No JavaScript-to-Java interface is exposed. Free milestone tools and restarts remain available.

Before a store release, select/configure an ad provider, add its native rewarded-video SDK and required manifest configuration, and implement an origin-restricted native reward adapter. Grant a life or tool **only** from the SDK's earned-reward callback, with a one-shot request token. Never grant on impression, dismissal, failed loading, or a JavaScript request alone. Keep all presentations behind the user's explicit reward button. Include test-ad/device validation, consent handling where required, and the provider's store disclosures. Never put secret credentials in JavaScript. `offerReward` in `web/app.js` is the UI integration point; it deliberately contains no production reward callback yet.

## Verification

```sh
npm test
npm run android:sync
```

Engine tests cover region connectivity, a unique solution at every supported size, deterministic regeneration, lives, reversible crosses, win/lockout, truthful hints, and onboarding progression. A 140-board regression sample also checks singleton limits, singleton frequency and mean, maximum region size, and unique solutions across all sizes and difficulty profiles.

Browser checks also exercised hints, reveals, double-click mistakes, persistence after reload, loss/revival, a complete solved level, and advancing to the next puzzle. The landing screen opens settings and care package details; longer hints open in a detail dialog. Both 4×4 and 10×10 puzzle screens fit a 320×568 viewport with no page overflow, and 390×640 / 390×844 were checked too. The 10×10 layout check used an isolated in-memory save so it did not advance the player's progress. No browser warnings or errors were reported during these checks. Android rendering, real touch timing, and live ads still require device testing.

## Shared daily leaderboard (1.4)

The daily entry offers **Race online** and **Practice offline**. Each installation automatically receives a random username and persistent local player ID, including offline. When online racing is configured, the app registers automatically and keeps the server-issued player ID and bearer token on the device. Existing profiles and rankings are preserved. Players can edit their public 2–20 character username in Settings; online renames retain their scores and require a connection. Clearing app data creates a new profile. One best result per profile per UTC day is ranked by server elapsed time, then mistakes, finish time, and profile ID. The game shows the top 50, a date selector for the last 90 days, and the player's own rank even outside the top 50. Offline personal bests never upload as ranked scores.

The AWS Lambda API lives in `aws-leaderboard/` and uses DynamoDB. The unused Sites/Cloudflare prototype and its dependency tree have been retired. Build the backend with `npm ci --prefix aws-leaderboard` and `npm run build --prefix aws-leaderboard`; API and transaction tests run against a local DynamoDB emulator without an AWS account. Production endpoint configuration is generated only after a verified Terraform deployment.

The API starts and times ranked runs on the server, validates their puzzle finds, rejects failed/incomplete attempts and retired run IDs, limits requests, hashes player bearer tokens, and accepts idempotent finish retries. Network travel contributes to the official time. If a finish cannot reach the server, retrying later includes that delay; an accepted finish retried after a lost response retains its original time. This provides basic score integrity, not strong bot protection: the deterministic puzzle engine is distributed with the app. Guest profiles do not sync across devices or recover after app data is cleared.

Deployment status: AWS is the production backend and its Terraform bootstrap is applied. The committed app has no production endpoint until a verified application apply generates its configuration; the deployment workflow then produces a connected debug APK. Offline play works without a deployed service. See [infrastructure/README.md](infrastructure/README.md) for deployment and approval steps.

## Persistent Android release signing

Local and CI distribution builds share a persistent signing key. Successful main-branch CI produces a connected release APK and a Play upload bundle; pull requests only produce development builds. See [Android signing](docs/ANDROID_SIGNING.md) for local builds, key backup, certificates, and migration from debug APKs.
