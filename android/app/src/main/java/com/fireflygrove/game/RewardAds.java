package com.fireflygrove.game;

import android.app.Activity;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.AgeRestrictedTreatment;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.util.Collections;
import org.json.JSONException;
import org.json.JSONObject;

/** Native SDK networking is isolated from the locked-down game WebView. */
final class RewardAds {
    private final Activity activity;
    private final ConsentInformation consent;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean busy, destroyed, consentReady, initialized;
    private RewardSession current;
    private Runnable cancelPending;
    private boolean presenting;

    RewardAds(Activity activity, WebView web) {
        this.activity = activity;
        consent = UserMessagingPlatform.getConsentInformation(activity);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
            WebViewCompat.addWebMessageListener(web, "FireflyAds", Collections.singleton(CloudBridgePolicy.ORIGIN), this::receive);
    }
    // Refresh at each launch; no ad SDK initialization or ad request before UMP permits it.
    void start() {
        // Treat every player, including adults and unknown ages, protectively.
        MobileAds.setRequestConfiguration(MobileAds.getRequestConfiguration().toBuilder()
            .setAgeRestrictedTreatment(AgeRestrictedTreatment.CHILD)
            .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_G)
            .setPublisherPrivacyPersonalizationState(RequestConfiguration.PublisherPrivacyPersonalizationState.DISABLED)
            .build());
        MobileAds.putPublisherFirstPartyIdEnabled(false);
        consent.requestConsentInfoUpdate(activity, new ConsentRequestParameters.Builder().setTagForUnderAgeOfConsent(true).build(),
            () -> { if (!destroyed) UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, error -> consentReady = true); },
            error -> consentReady = true);
    }
    private void reply(JavaScriptReplyProxy proxy, String id, boolean ok, boolean earned, String error) {
        if (destroyed || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        try { proxy.postMessage(new JSONObject().put("id", id).put("ok", ok).put("earned", earned)
            .put("error", error).put("testAds", activity.getString(R.string.rewarded_ad_unit_id).startsWith("ca-app-pub-3940256099942544/"))
            .put("privacyRequired", consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED).toString()); }
        catch (JSONException | IllegalStateException ignored) { /* Requesting document closed. */ }
    }
    private void receive(WebView web, WebMessageCompat message, Uri origin, boolean mainFrame, JavaScriptReplyProxy proxy) {
        if (!CloudBridgePolicy.allowed(origin.toString(), mainFrame) || message.getType() != WebMessageCompat.TYPE_STRING) return;
        try {
            String text = message.getData(); if (text == null || text.length() > 512) return;
            JSONObject request = new JSONObject(text);
            String id = request.optString("id"), operation = request.optString("operation"), kind = request.optString("kind");
            if (!RewardSession.valid(id, operation, kind)) return;
            if ("cancel".equals(operation)) { pause(); return; }
            if ("status".equals(operation)) { reply(proxy, id, true, false, ""); return; }
            if (busy) { reply(proxy, id, false, false, "An ad request is already running."); return; }
            if (!consentReady) { reply(proxy, id, false, false, "Privacy settings are still loading. Please try again shortly."); return; }
            if ("privacy".equals(operation)) {
                if (consent.getPrivacyOptionsRequirementStatus() != ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
                    reply(proxy, id, true, false, ""); return;
                }
                busy = true;
                UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {
                    busy = false; reply(proxy, id, error == null, false, error == null ? "" : "Privacy choices could not load. Please retry.");
                }); return;
            }
            if (!consent.canRequestAds()) { reply(proxy, id, false, false, "Reward videos are unavailable with the current privacy settings. Free restarts and milestone tools are still available."); return; }
            busy = true; RewardSession session = new RewardSession(); current = session;
            cancelPending = () -> finish(session, proxy, id, false, "Video loading was cancelled. You can try again.");
            // Bound initialization/loading; never time out an ad already on screen.
            Runnable timeout = () -> finish(session, proxy, id, false, "The video took too long to load. Please try again.");
            handler.postDelayed(timeout, 60000);
            if (initialized) load(session, proxy, id, timeout);
            else MobileAds.initialize(activity, status -> activity.runOnUiThread(() -> {
                initialized = true; if (active(session)) load(session, proxy, id, timeout);
            }));
        } catch (JSONException ignored) { /* Reject malformed messages without exposing SDK methods. */ }
    }
    private boolean active(RewardSession session) { return !destroyed && current == session; }
    private void finish(RewardSession session, JavaScriptReplyProxy proxy, String id, boolean ok, String error) {
        if (!active(session) || !session.finish()) return;
        current = null; cancelPending = null; presenting = false; busy = false; reply(proxy, id, ok, session.earned(), error);
    }
    private void load(RewardSession session, JavaScriptReplyProxy proxy, String id, Runnable timeout) {
        RewardedAd.load(activity, activity.getString(R.string.rewarded_ad_unit_id), new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdFailedToLoad(LoadAdError error) {
                handler.removeCallbacks(timeout); finish(session, proxy, id, false, "No reward video is available right now. Please try again later.");
            }
            @Override public void onAdLoaded(RewardedAd ad) {
                if (!active(session)) return;
                handler.removeCallbacks(timeout);
                if (activity.isFinishing() || activity.isDestroyed() || !activity.hasWindowFocus()) {
                    finish(session, proxy, id, false, "Return to the game and try again."); return;
                }
                ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override public void onAdDismissedFullScreenContent() { finish(session, proxy, id, true, ""); }
                    @Override public void onAdFailedToShowFullScreenContent(AdError error) { finish(session, proxy, id, false, "The video could not open. Please try again."); }
                });
                presenting = true;
                ad.show(activity, reward -> { if (active(session)) session.earn(); });
            }
        });
    }
    void pause() { if (!presenting && cancelPending != null) cancelPending.run(); }
    void destroy() { destroyed = true; current = null; cancelPending = null; handler.removeCallbacksAndMessages(null); }
}
