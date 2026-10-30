package com.fireflygrove.game;

/** A single request can earn once; dismissal, failure and replay never earn. */
final class RewardSession {
    private boolean earned, finished;
    boolean earn() { if (earned || finished) return false; earned = true; return true; }
    boolean finish() { if (finished) return false; finished = true; return true; }
    boolean earned() { return earned; }
    static boolean valid(String id, String operation, String kind) {
        return id != null && id.matches("[a-z0-9-]{1,64}") &&
            ("cancel".equals(operation) || "privacy".equals(operation) || "status".equals(operation) ||
            ("show".equals(operation) && ("life".equals(kind) || "hints".equals(kind) || "reveals".equals(kind))));
    }
}
