package com.fireflygrove.game;

import org.junit.Test;
import static org.junit.Assert.*;

public class CloudBridgePolicyTest {
    @Test public void cloudMessagesRequireExactPackagedOriginAndMainFrame() {
        assertTrue(CloudBridgePolicy.allowed("https://appassets.androidplatform.net", true));
        assertFalse(CloudBridgePolicy.allowed("https://appassets.androidplatform.net", false));
        for (String origin : new String[]{null,"null","https://evil.example","http://appassets.androidplatform.net",
            "https://appassets.androidplatform.net.evil.example","https://appassets.androidplatform.net:444",
            "https://user@appassets.androidplatform.net","https://appassets.androidplatform.net/assets/"}) {
            assertFalse(origin, CloudBridgePolicy.allowed(origin, true));
        }
    }
    @Test public void onlySmallCorrelatedRequestsAndKnownCloudOperationsAreAccepted() {
        for (String operation : new String[]{"status","read","write","adopt","cancel","disconnect"})
            assertTrue(CloudBridgePolicy.validRequest("abc-123",operation));
        for (String id : new String[]{null,"","a".repeat(65),"<script>","../x","ABC"})
            assertFalse(CloudBridgePolicy.validRequest(id,"read"));
        for (String operation : new String[]{null,"delete","eval","openUrl","readFile","__proto__",""})
            assertFalse(CloudBridgePolicy.validRequest("abc",operation));
    }
}
