# Google Play cloud saves

Implementation is ready for configuration and end-to-end testing. It is not activated by an APK upload alone. The numeric Play Games Services project ID, Saved Games feature, Android credentials and tester access must be configured in Play Console. A build without the project ID supports guest play and shows cloud saving as unavailable.

## Console setup

1. Open Firefly Grove in Play Console. Go to **Grow users → Play Games Services → Setup and management → Configuration**, and create or link the game's Play Games Services project.
2. Under **Edit properties**, enable **Saved Games** and save. Activation can take time; see [Google's Saved Games instructions](https://support.google.com/googleplay/android-developer/answer/2990418).
3. Add Android credentials for package **com.fireflygrove.game**. Each credential must match the certificate of the installed app. For a Play-installed build, use the **App signing key certificate SHA-1** from Play Console's App integrity page. For a locally sideloaded release APK, use the existing release/upload certificate SHA-1: **92:CA:72:5D:95:3D:FB:5C:E7:B2:81:60:89:44:B3:A1:37:39:12:56**. These can be different credentials for the same game. See [Google's setup guide](https://developer.android.com/games/pgs/console/setup).
4. Enable tester accounts or the linked testing release track under **Play Games Services → Testers**. A Play Store testing invitation alone does not establish every PGS configuration step. Follow [testing and publishing guidance](https://developer.android.com/games/pgs/console/publish) before public release.
5. Copy the **numeric Game Services project ID** displayed on the Configuration page. This is a public identifier, not an OAuth client secret. This implementation needs no web/server OAuth secret or google-services.json.

## Build configuration

CI's signed Android jobs read the repository variable **PLAY_GAMES_PROJECT_ID**. Set it to the numeric ID from step 5. It is passed to Gradle as ANDROID_PLAY_GAMES_PROJECT_ID. Existing signing secrets stay unchanged.

For a local build, copy android/play-games.properties.example to android/play-games.properties and set projectId to that same numeric ID. The local file is ignored by Git. Alternatively pass -PplayGamesProjectId=NUMERIC_ID to Gradle. The project property takes precedence, followed by the environment variable, followed by the local properties file. Zero means unconfigured.

The manifest receives a string resource for com.google.android.gms.games.APP_ID. Only a valid, configured project initializes the pinned Play Games v2 SDK (22.1.0). The SDK's automatic initialization provider is removed so an unconfigured preview does not try to initialize an invalid project. Application initialization suppresses automatic profile-creation prompts, following [platform authentication guidance](https://developer.android.com/games/pgs/android/android-signin). Existing Play Games profiles may authenticate at launch; game-state backup remains explicitly opt-in.

No AWS schema, role, resource, or API deployment is required. The existing AWS guest credential remains the authentication mechanism for rankings; the native PGS player ID is only a local account-change guard.

## Player flow

Settings offers **Link Google Play and save**. The native SDK authenticates, then opens the private firefly-grove-progress-v1 snapshot. If there is no backup, the current device save is written. Identical saves are adopted without another write. If device and cloud differ independently, the player chooses one complete save. SDK-reported simultaneous-write conflicts also present a choice. The UI shows level, completed levels, hints, reveals and save time; the timestamp is informational and never automatically decides the winner.

Selecting a cloud save restores its profile and progress, retains a local recovery copy of the previous device save, then reloads the app so profile and scoring controllers use the restored identity. Choosing device progress uses its latest state. Tool balances and hearts are never summed or maximized across copies. The server still validates hearts and counts a level once per profile.

Ordinary changes sync after a short quiet interval, at most once per 30 seconds. Level completion and app backgrounding request an immediate sync. Failed or offline operations preserve the device save and can be retried with **Sync now**. Native Saved Games commits may be cached locally for later upload; the UI does not claim a remote upload has finished. See [Saved Games offline behavior](https://developer.android.com/games/pgs/android/saved-games).

An automatic sync that discovers a conflict flags Settings and a home-screen attention button; it does not interrupt a puzzle or overwrite progress. Changing the Play Games account disables syncing and requires explicit linking again. **Stop cloud saves on this device** stops future backup operations, preserves device progress, and keeps the existing backup. It does not sign the user out of their OS Play Games account or delete cloud data. Google Play's account/game-data controls manage deletion separately.

## Backup contents and privacy

The private snapshot includes the install seed and duplicate-board history; current journey board, marks, lives and timing; level/completion totals; hint and reveal balances; settings; daily personal-best records and a practice copy of daily progress; and the current production leaderboard profile plus queued heart submissions. The profile includes its existing guest authentication credential so a different device can recover the same server identity, username and historical rankings.

Test-server profiles, the redundant profile alias, legacy migration-only previousPuzzle data, and active ranked-run tickets/history are not exported. Online race tickets are neither restored nor transferred; timed submissions remain on the originating installation. Cloud restore is a whole-save selection, so finish/upload an active race before replacing that device's save. Pending hearts still must upload before their UTC scoring day ends. No snapshot, guest credential or Google token is logged.

The native platform player ID/name are used for detecting a changed account and displaying the connected account. Google OAuth access/refresh tokens and secrets are not placed in the WebView state. The backup is saved-game data under the signed-in Play Games account, not a public leaderboard entry. Update the store privacy policy and Data safety answers for the SDK and opt-in backup before a public release.

The versioned envelope is capped at 2,500,000 UTF-8 bytes. Invalid/future formats and malformed game data are rejected before restoration. A local recovery copy is stored under firefly-cloud-before-restore-v1. Settings offers Restore previous device save: it validates and restores that copy, stops future cloud syncing, and keeps the current device state as the new recovery copy. This does not delete or replace the Google Play snapshot. Storage failures preserve the active device save and report an error.

## Required live tests after Console configuration

- Install a configured release on two devices with Google Play services, the matching signing credential, and an authorized tester account. A build that merely compiles with a dummy ID does not establish authentication.
- Play as a guest, change username/settings, finish levels, spend tools, then link. Confirm the backup and original profile ID.
- Link the same Play Games account on device two. Choose the cloud save and confirm board notes, tools, settings, completed levels, daily bests, player ID and historical rankings. Confirm a new AWS player is not registered for the restored production profile.
- Change different progress on both devices, including offline play. Reconnect and confirm an explicit save choice, no combined balances, and no silent replacement. Test SDK-returned concurrent conflicts and retry after an interruption.
- Cancel Google authentication and save selection. Try an unavailable network, interrupted commit and background/foreground cycle. Confirm local play and the last device save remain usable.
- Switch the OS Play Games account while linked. Confirm automatic and manual sync refuse to copy the previous account's save until linking again. Stop cloud saving and confirm the backup is retained.
- Test a fresh install restored from cloud through the Play testing track as well as sideloading if that distribution is supported. Keep signing keys stable; never clear a tester's only device save just to test recovery.

Automated Node tests cover schema validation, private-field selection, profile recovery, conflict choices, offline/error paths, stale metadata, request correlation/timeouts, restoration failure, and Settings integration. Android JVM tests cover the bridge's exact-origin, main-frame, operation and request-ID policies. Native compile/lint verifies SDK APIs and manifest merging. Actual Google authentication and cross-device behavior require the real project and authorized devices.
