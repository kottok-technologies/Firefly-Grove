# Rewarded ads

AdMob is integrated natively using `play-services-ads:25.5.0` and UMP `4.0.0`. Google lists AdMob 19.0.0 and later in the Families self-certified SDK list; recheck the specific version in Play SDK Index before release. No mediation adapters or custom events are installed.

## Behavior

The existing optional reward buttons offer one hint, one reveal or one journey life. Loading and SDK initialization start only after Watch video, following the launch-time UMP update. Earned state is set only by the SDK's `OnUserEarnedRewardListener`; the requesting page receives the result when the ad closes. Dismissal without earning, no fill, failed presentation, malformed/replayed messages, and duplicate requests do not award anything. A 60-second initialization/load timeout restores retry; a displayed ad is never timed out by the game. Daily timed puzzles still prohibit tools and revives.

The bridge uses an exact packaged HTTPS origin and main-frame-only WebMessage listener, fixed operations and request IDs. The game's CSP and network allowlist are unchanged. SDK content/networking runs separately from the game WebView. Native replies are one-shot. Rewards are local inventory; they are not server-attested monetary transactions. Killing the process during an ad can lose that pending reward; it never grants a reward based on a reload or unverified JavaScript request.

Every player gets child-protective ad treatment, including unknown ages and adults: `AgeRestrictedTreatment.CHILD`, maximum content rating `G`, disabled publisher personalization, disabled publisher first-party ID, UMP under-age-of-consent treatment, and removal of `AD_ID` permission. Consent permission is checked with UMP before initialization/requesting an ad; unavailable ads leave free restarts and milestones usable. Settings offers Ad privacy choices only when UMP requires that entry point. No user ID, username, cloud save or leaderboard credential is passed to AdMob. There is no age-based adult advertising path.

## Configuration

Debug always uses Google's dedicated test ad unit, with the configured app ID so your UMP messages can be tested. With no configuration the sample app ID is used; UMP may refuse an unregistered sample app, in which case ads remain unavailable. Configure your real app ID and Privacy & messaging to validate consent with test inventory. Release also defaults to test IDs until configured. An unconfigured build does not earn advertising revenue. The reward amount is determined by the selected game action, not arbitrary reward strings supplied by an ad creative.

1. In AdMob, register the Android app `com.fireflygrove.game`. Link the correct Play listing when available.
2. Copy its public **App ID** (`ca-app-pub-…~…`) and create a **Rewarded** ad unit (`ca-app-pub-…/…`). Use a generic reward name such as “Perk”, amount 1; the game's opt-in dialog states the specific reward. Do not use rewarded interstitials.
3. Add local ignored `android/ads.properties`:

   ```properties
   appId=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   rewardedId=ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY
   ```

4. Add GitHub repository **variables** `ADMOB_APP_ID` and `ADMOB_REWARDED_ID`. Signed Android release workflows pass them as `ANDROID_ADMOB_APP_ID` / `ANDROID_ADMOB_REWARDED_ID`. They are public identifiers, not API keys. Debug ignores the production ad unit ID.
5. Configure AdMob Privacy & messaging, audience and content restrictions consistently with the declared Play audience. Do not enable mediation, custom events or high-engagement configurations without another Families review. Register publisher app-ads.txt using the exact entry from your account; hosting this on the developer website requires a separate reviewed Terraform change.

## Required before an all-ages release

This ad integration does **not** certify the entire existing app as Families compliant. The developer selected children and adults as the intended audience. Review the existing automatically registered AWS profile, editable public usernames, leaderboards and Play Games automatic authentication/cloud features for child data practices, parental controls and applicable consent. Implement a neutral age screen and appropriate restrictions for those features before an all-ages production submission. Until that review is complete, use test ads for development and do not distribute this as a Families-approved release. Applying child-directed ad flags does not resolve these separate account/social requirements.

- Complete Play Console Target audience, Contains ads, IARC and Data safety accurately. Include AdMob's collection of network/approximate location, interactions, diagnostics and applicable identifiers with the actual child-directed restrictions. Review Play Games and AWS data as well.
- Deploy the updated October 30 privacy policy through the existing protected Terraform workflow, review the saved plan, obtain the production approval, and verify the public URL. It has **not** been deployed by this source change.
- Verify the specific SDK's current Families status in Play SDK Index, account settings and child-directed/G content requests on-device. Do not assume the SDK listing guarantees every creative.
- Families requires opt-in/rewarded ads that interrupt gameplay to be dismissible within **five seconds**. Test actual AdMob child-directed inventory and confirm a clear close action. Never add an app-owned fake close button over SDK ad content. If this requirement cannot be met, do not enable that placement for children or unknown ages.
- Test on a physical device/emulator: earn each of the three rewards once; early close grants zero; failed/no-fill/offline and loading timeout grant zero; repeat taps cannot stack requests; app background/return does not auto-open an ad; reopening the app is safe; a life does not revive a different puzzle; timed daily modes remain tool-free; free restart remains available.
- Do not click live ads while testing. Debug uses test inventory. This source change compiles/tests/lints Android but does not produce a signed APK/AAB or increment the version.

Sources checked October 30, 2026:

- [AdMob Families guidance](https://support.google.com/admob/answer/6223431)
- [Google Play Families requirements](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Self-certified SDK list](https://support.google.com/googleplay/android-developer/answer/12955712)
- [Request targeting / child treatment](https://developers.google.com/admob/android/targeting)
- [UMP integration](https://developers.google.com/admob/android/privacy)
- [Rewarded SDK callbacks](https://developers.google.com/admob/android/rewarded)
- [SDK data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [Disable publisher first-party ID](https://developers.google.com/admob/android/privacy/strategies)
