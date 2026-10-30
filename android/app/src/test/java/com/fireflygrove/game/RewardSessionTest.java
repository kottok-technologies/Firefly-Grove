package com.fireflygrove.game;
import org.junit.Test;
import static org.junit.Assert.*;
public class RewardSessionTest {
    @Test public void rewardRequiresEarnedCallbackAndCannotReplay() {
        RewardSession dismissed = new RewardSession(); assertTrue(dismissed.finish()); assertFalse(dismissed.earned()); assertFalse(dismissed.earn());
        RewardSession earned = new RewardSession(); assertTrue(earned.earn()); assertFalse(earned.earn()); assertTrue(earned.finish()); assertTrue(earned.earned()); assertFalse(earned.finish());
    }
    @Test public void onlyNarrowRequestsAreAccepted() {
        assertTrue(RewardSession.valid("abc-1", "show", "life")); assertTrue(RewardSession.valid("abc", "privacy", ""));
        assertFalse(RewardSession.valid("", "show", "life")); assertFalse(RewardSession.valid("abc", "show", "coins")); assertFalse(RewardSession.valid("abc", "earn", "life"));
    }
}
