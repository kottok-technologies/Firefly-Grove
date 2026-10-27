package com.fireflygrove.game;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Build;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;

/** Offline shell: every game asset comes from the packaged web directory. */
public final class MainActivity extends Activity {
    private WebView web;
    private OnBackInvokedCallback backCallback;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xfff7f8f2);
        getWindow().setNavigationBarColor(0xfff7f8f2);
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web = new WebView(this);
        web.setBackgroundColor(0xfff7f8f2);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return loader.shouldInterceptRequest(request.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !request.getUrl().toString().startsWith("https://appassets.androidplatform.net/assets/"); }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return loader.shouldInterceptRequest(request.getUrl()); }
        });
        // Native builds never grant a simulated advertising reward.
        // Replace this marker with a configured rewarded-ad adapter before release.
        web.addJavascriptInterface(new RewardAvailability(), "AndroidRewards");
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xfff7f8f2);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        // Android 15 enforces edge-to-edge for target 35; keep game controls
        // clear of status bars, display cutouts, and gesture navigation.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }
    public static final class RewardAvailability {
        @JavascriptInterface public boolean isAvailable() { return false; }
    }
    @Override protected void onPause() { web.evaluateJavascript("document.dispatchEvent(new Event('visibilitychange'))", null); web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    private void handleBack() { web.evaluateJavascript("document.getElementById('modal').open ? (document.getElementById('close-modal').click(),true) : (window.returnToLanding ? window.returnToLanding() : false)", result -> { if (!"true".equals(result)) finish(); }); }
    // Only pre-Android-13 devices use this entry point. Newer devices use the
    // OnBackInvokedCallback registered above; lint does not detect that split.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() {
        if (Build.VERSION.SDK_INT < 33) handleBack();
    }
    @Override protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null)
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        web.destroy(); super.onDestroy();
    }
}
