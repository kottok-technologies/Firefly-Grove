package com.fireflygrove.game;

import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;

/** The bridge is a narrow capability for the packaged main document only. */
final class CloudBridgePolicy {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final int MAX_BYTES = 2500000;
    private static final Set<String> OPERATIONS = new HashSet<>(Arrays.asList("status", "read", "write", "adopt", "cancel", "disconnect"));
    static boolean allowed(String origin, boolean mainFrame) {
        return mainFrame && ORIGIN.equals(origin);
    }
    static boolean validRequest(String id, String operation) {
        return id != null && id.matches("[a-z0-9-]{1,64}") && operation != null && OPERATIONS.contains(operation);
    }
    private CloudBridgePolicy() {}
}
