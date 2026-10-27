package com.fireflygrove.game;

import org.junit.Test;
import static org.junit.Assert.*;

public class WebSecurityPolicyTest {
    @Test public void packagedAssetsRequireExactHttpsOriginAndSafePath() {
        assertTrue(WebSecurityPolicy.isPackagedAsset("https://appassets.androidplatform.net/assets/index.html"));
        assertTrue(WebSecurityPolicy.isPackagedAsset("https://appassets.androidplatform.net:443/assets/app.js"));
        for (String value : new String[]{null, "file:///assets/index.html", "http://appassets.androidplatform.net/assets/index.html",
            "https://appassets.androidplatform.net.evil.example/assets/index.html", "https://evil.example/assets/index.html",
            "https://evil@appassets.androidplatform.net/assets/index.html", "https://appassets.androidplatform.net:444/assets/app.js",
            "https://appassets.androidplatform.net/assets/%2e%2e/private", "javascript:alert(1)", "not a URL"}) {
            assertFalse(value, WebSecurityPolicy.isPackagedAsset(value));
        }
    }
    @Test public void remoteRequestsAreApiOnlyAndNeverTopLevelNavigation() {
        String api = "https://abc123.execute-api.us-east-1.amazonaws.com/api/v1/leaderboard?day=2026-10-27";
        for (String method : new String[]{"GET","POST","PUT","OPTIONS"}) assertTrue(WebSecurityPolicy.isApiRequest(api,false,method));
        assertFalse(WebSecurityPolicy.isApiRequest(api,true,"GET"));
        assertFalse(WebSecurityPolicy.isApiRequest(api,false,"DELETE"));
        for (String value : new String[]{"http://abc123.execute-api.us-east-1.amazonaws.com/api/v1/health",
            "https://abc123.execute-api.us-east-1.amazonaws.com.evil.example/api/v1/health",
            "https://abc123.execute-api.us-east-2.amazonaws.com/api/v1/health",
            "https://abc123.execute-api.us-east-1.amazonaws.com/script.js",
            "https://user@abc123.execute-api.us-east-1.amazonaws.com/api/v1/health",
            "https://abc123.execute-api.us-east-1.amazonaws.com/api/v1/../script.js"}) {
            assertFalse(value,WebSecurityPolicy.isApiRequest(value,false,"GET"));
        }
    }
    @Test public void contentPolicyAllowsOnlyPackagedScriptsAndNoFramesOrForms() {
        assertTrue(WebSecurityPolicy.CONTENT_POLICY.contains("script-src 'self';"));
        assertTrue(WebSecurityPolicy.CONTENT_POLICY.contains("worker-src 'self';"));
        assertTrue(WebSecurityPolicy.CONTENT_POLICY.contains("default-src 'none';"));
        assertTrue(WebSecurityPolicy.CONTENT_POLICY.contains("form-action 'none'; frame-ancestors 'none'"));
        assertFalse(WebSecurityPolicy.CONTENT_POLICY.contains("'unsafe-eval'"));
        assertFalse(WebSecurityPolicy.CONTENT_POLICY.contains("script-src 'self' 'unsafe-inline'"));
    }
}
