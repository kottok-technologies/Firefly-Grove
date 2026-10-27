package com.fireflygrove.game;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Build;
import android.net.Uri;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Offline shell: every game asset comes from the packaged web directory. */
public final class MainActivity extends Activity {
    private static final String APP_URL = "https://appassets.androidplatform.net/assets/index.html";
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
        // Required by the packaged game engine. Executable content is restricted
        // to APK assets by interception, CSP, and blocked external navigation.
        // No Java object or native message bridge is exposed to page scripts.
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.getSettings().setSupportMultipleWindows(false);
        web.getSettings().setGeolocationEnabled(false);
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return intercept(loader, request); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !isPackagedAsset(request.getUrl()); }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return intercept(loader, request); }
        });
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
        web.loadUrl(APP_URL);
    }
    private static boolean isPackagedAsset(Uri uri) {
        return WebSecurityPolicy.isPackagedAsset(uri.toString());
    }
    private static WebResourceResponse intercept(WebViewAssetLoader loader, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (isPackagedAsset(uri)) {
            WebResourceResponse response = loader.shouldInterceptRequest(uri);
            if (response == null) return blocked();
            Map<String,String> headers = new HashMap<>();
            if (response.getResponseHeaders() != null) headers.putAll(response.getResponseHeaders());
            headers.put("Content-Security-Policy", WebSecurityPolicy.CONTENT_POLICY);
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("X-Frame-Options", "DENY");
            response.setResponseHeaders(headers);
            return response;
        }
        // Only JSON API traffic may leave the shell. CSP independently prevents
        // loading remote executable content, frames, inline handlers, and eval.
        if (WebSecurityPolicy.isApiRequest(uri.toString(), request.isForMainFrame(), request.getMethod())) return null;
        return blocked();
    }
    private static WebResourceResponse blocked() {
        Map<String,String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", headers,
            new ByteArrayInputStream("Blocked by the packaged app policy.".getBytes(StandardCharsets.UTF_8)));
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
