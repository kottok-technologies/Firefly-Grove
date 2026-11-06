package com.fireflygrove.game

import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/** Exact-origin main-frame messages only; never exposes SDK session/challenge/claim tokens. */
internal object KidBridge {
    fun install(web: WebView, gate: KidGate) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(web, "FireflyKid", setOf(CloudBridgePolicy.ORIGIN)) { _, message, origin, main, reply ->
            if (!CloudBridgePolicy.allowed(origin.toString(), main)) return@addWebMessageListener
            if (message.type != WebMessageCompat.TYPE_STRING) return@addWebMessageListener
            val text = message.data ?: return@addWebMessageListener
            if (text.length > 256) return@addWebMessageListener
            try {
                val request = JSONObject(text)
                val id = request.optString("id")
                val operation = request.optString("operation")
                if (!id.matches(Regex("[a-z0-9-]{1,64}")) || operation !in setOf("status", "settings")) return@addWebMessageListener
                if (operation == "settings") gate.openSettings()
                val proof = gate.proof()
                reply.postMessage(JSONObject().put("id", id).put("ok", true)
                    .put("rankings", gate.allowed("leaderboard-and-rankings") && gate.allowed("public-profile"))
                    .put("username", gate.allowed("custom-username"))
                    .put("proof", proof).put("message", gate.claimMessage()).toString())
            } catch (_: Exception) { /* Malformed messages never authorize anything. */ }
        }
    }
}
