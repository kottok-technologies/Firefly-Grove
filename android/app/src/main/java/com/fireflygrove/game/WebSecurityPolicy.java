package com.fireflygrove.game;

import java.net.URI;

/** Pure URL/CSP policy, shared by navigation and resource interception. */
final class WebSecurityPolicy {
    static final String CONTENT_POLICY = "default-src 'none'; script-src 'self'; worker-src 'self'; "
        + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; "
        + "connect-src https://*.execute-api.us-east-1.amazonaws.com; "
        + "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

    private static URI secureUri(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443) ? uri : null;
        } catch (IllegalArgumentException | NullPointerException invalid) { return null; }
    }
    static boolean isPackagedAsset(String value) {
        URI uri = secureUri(value);
        return uri != null && "appassets.androidplatform.net".equals(uri.getHost())
            && uri.getPath() != null && uri.getPath().startsWith("/assets/") && !uri.getPath().contains("..");
    }
    static boolean isApiRequest(String value, boolean mainFrame, String method) {
        URI uri = secureUri(value);
        return !mainFrame && uri != null && uri.getHost().matches("[a-z0-9]+\\.execute-api\\.us-east-1\\.amazonaws\\.com")
            && uri.getPath() != null && uri.getPath().startsWith("/api/v1/") && !uri.getPath().contains("..")
            && ("GET".equals(method) || "POST".equals(method) || "PUT".equals(method) || "OPTIONS".equals(method));
    }
    private WebSecurityPolicy() {}
}
