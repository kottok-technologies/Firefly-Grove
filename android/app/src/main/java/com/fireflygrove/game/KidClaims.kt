package com.fireflygrove.game

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.security.SecureRandom
import java.util.concurrent.Executors

/** Durable, private outbox. No birth date, email, secret key, or claim token enters logs/cloud saves. */
internal class KidClaims(context: Context, private val prefs: SharedPreferences, private val onChange: () -> Unit) {
    private val io = Executors.newSingleThreadExecutor()
    private val origin: String? = context.assets.open("leaderboard-config.js").bufferedReader().use { it.readText() }
        .let(WebSecurityPolicy::consentApiOrigin)
    @Volatile private var ready = false
    @Volatile var message = "Online permission verification is pending."
        private set
    @Volatile private var token: String = prefs.getString("authorization", null) ?: ByteArray(32).also {
        SecureRandom().nextBytes(it)
    }.joinToString("") { "%02x".format(it) }.also {
        check(prefs.edit().putString("authorization", it).commit())
    }

    fun proof(): String = if (ready) token else ""
    fun submit(claim: String) {
        if (claim.isBlank() || claim.length > 6000) return
        check(prefs.edit().putString("claimToken", claim).putLong("claimTime", System.currentTimeMillis()).commit())
        retry()
    }
    fun sessionAvailable() { retry() }
    @Volatile private var epoch = 0
    fun retry() {
        if (io.isShutdown) return
        val requestEpoch = epoch
        val bearer = token
        io.execute {
            if (requestEpoch != epoch) return@execute
            try {
                val claim = prefs.getString("claimToken", null)
                if (claim != null) {
                    if (System.currentTimeMillis() - prefs.getLong("claimTime", 0) > 600000) {
                        message = "Online verification expired. Start the age check again."
                        ready = false
                        return@execute
                    }
                    post("claim", JSONObject().put("claimToken", claim), bearer)
                    if (requestEpoch != epoch) return@execute
                    prefs.edit().remove("claimToken").remove("claimTime").commit()
                }
                val result = post("session", JSONObject(), bearer)
                if (requestEpoch != epoch) return@execute
                ready = result.optBoolean("accepted", false)
                message = if (ready) "Online permissions verified." else "Waiting for online permission verification."
            } catch (_: Exception) {
                if (requestEpoch != epoch) return@execute
                ready = false
                message = "Online verification is unavailable. Your local game is safe; try again later."
            } finally { if (requestEpoch == epoch) onChange() }
        }
    }
    private fun post(path: String, body: JSONObject, bearer: String): JSONObject {
        val base = origin ?: throw IllegalStateException("Backend not configured")
        val connection = URI(base + "/api/v1/consent/" + path).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Firefly-Consent", bearer)
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            check(connection.responseCode in 200..299)
            val text = connection.inputStream.use { stream ->
                val buffer = ByteArray(16385)
                var count = 0
                while (count < buffer.size) {
                    val n = stream.read(buffer, count, buffer.size - count)
                    if (n < 0) break
                    count += n
                }
                buffer.copyOf(count)
            }
            check(text.size <= 16384)
            return JSONObject(String(text, Charsets.UTF_8))
        } finally { connection.disconnect() }
    }
    fun reset() {
        epoch++
        ready = false
        token = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        prefs.edit().putString("authorization", token).commit()
        prefs.edit().remove("claimToken").remove("claimTime").commit()
    }
    fun destroy() { epoch++; ready = false; io.shutdownNow() }
}
