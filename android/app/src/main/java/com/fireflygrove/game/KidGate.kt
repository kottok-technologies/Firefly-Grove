package com.fireflygrove.game

import android.view.View
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.kid.core.DeclareField
import com.kid.core.JurisdictionCode
import com.kid.core.KIDDeclare
import com.kid.core.PermissionName
import com.kid.core.ui.*
import java.util.function.Supplier

/** Native root. The WebView (and its background networking) exists only in the pass slot. */
class KidGate(private val activity: ComponentActivity) {
    private val publishableKey = activity.getString(R.string.kid_publishable_key)
    private val baseUrl = activity.getString(R.string.kid_base_url)
    private val live = publishableKey.startsWith("kgp_live_")
    private val prefs = activity.getSharedPreferences(
        if (live) "firefly_kid_live" else "firefly_kid",
        0,
    )
    private val claims = KidClaims(activity, prefs, live) { activity.runOnUiThread { notifyPermissions() } }
    private var settings by mutableStateOf(false)
    private var reset by mutableIntStateOf(0)
    private var refresh by mutableIntStateOf(0)
    private var passed = false
    private var permissions = emptyMap<PermissionName, Boolean>()
    private var web: WebView? = null

    fun install(factory: Supplier<View>) {
        activity.setContent {
            MaterialTheme {
                key(reset) {
                    KIDCoreProvider(
                        publishableKey = publishableKey,
                        baseUrl = baseUrl,
                        declare = KIDDeclare(
                            permissions = listOf(
                                KIDDeclare.Permission(PermissionName.LEADERBOARD_AND_RANKINGS),
                                KIDDeclare.Permission(PermissionName.PUBLIC_PROFILE),
                                KIDDeclare.Permission(PermissionName.CUSTOM_USERNAME),
                            ),
                            privacyPolicyUrl = DeclareField.Set("https://www.kottok-technologies.com/games/fireflygrove/privacy-policy.html"),
                            termsOfServiceUrl = DeclareField.Set("https://www.kottok-technologies.com/games/fireflygrove/terms-of-service.html"),
                            iconUrl = DeclareField.Set("file:///android_asset/assets/game-icon.png"),
                            supportEmail = "kottok.technologies@gmail.com",
                        ),
                    ) {
                        KIDSessionProvider(
                            jurisdiction = JurisdictionCode.AUTO,
                            sessionId = prefs.getString("sessionId", null),
                            challengeId = prefs.getString("challengeId", null),
                            onChallenge = { prefs.edit().putString("challengeId", it).commit() },
                            onSession = {
                                prefs.edit().putString("sessionId", it).remove("challengeId").commit()
                                // The backend resolves its OWN claimed challenge, never this client ID.
                                claims.sessionAvailable()
                            },
                            onClaim = { claims.submit(it) },
                        ) {
                            val session = useKIDSession()
                            DisposableEffect(Unit) {
                                val observer = LifecycleEventObserver { _, event ->
                                    if (event == Lifecycle.Event.ON_RESUME) {
                                        refresh++
                                        claims.retry()
                                    }
                                }
                                activity.lifecycle.addObserver(observer)
                                onDispose {
                                    activity.lifecycle.removeObserver(observer)
                                    passed = false
                                    permissions = emptyMap()
                                }
                            }
                            LaunchedEffect(refresh) {
                                try { session.refresh() } catch (_: Exception) {
                                    passed = false
                                    permissions = emptyMap()
                                }
                            }
                            Box(Modifier.fillMaxSize().background(Color(0xfff7f8f2))) {
                                KIDAgeGate(
                                    modifier = Modifier.fillMaxSize().statusBarsPadding().imePadding()
                                        .padding(24.dp).verticalScroll(rememberScrollState()),
                                    pass = {
                                        SideEffect {
                                            val next = session.permissions.toMap()
                                            val changed = !passed || permissions != next
                                            passed = true
                                            permissions = next
                                            if (changed) notifyPermissions()
                                        }
                                        DisposableEffect(Unit) {
                                            onDispose { passed = false; permissions = emptyMap(); notifyPermissions() }
                                        }
                                        AndroidView(factory = { factory.get() }, modifier = Modifier.fillMaxSize())
                                        if (settings) {
                                            BackHandler { settings = false; refresh++ }
                                            Column(Modifier.fillMaxSize().background(Color(0xfff7f8f2))
                                                .safeDrawingPadding().padding(20.dp).verticalScroll(rememberScrollState())) {
                                                Text("Privacy & permissions", style = MaterialTheme.typography.headlineSmall)
                                                KIDSettingsProvider(
                                                    sessionId = session.sessionId ?: prefs.getString("sessionId", "")!!,
                                                    challengeId = prefs.getString("settingsChallengeId", null),
                                                    onChallenge = { prefs.edit().putString("settingsChallengeId", it).commit() },
                                                ) { KIDSettings() }
                                                KIDPermission(PermissionName.LEADERBOARD_AND_RANKINGS, fallback = { Text("Leaderboard permission is off.") }) { Text("Leaderboard permission is on.") }
                                                KIDPermission(PermissionName.CUSTOM_USERNAME, fallback = { Text("Custom usernames are off.") }) { Text("Custom usernames are enabled.") }
                                                Text(claims.message)
                                                TextButton(onClick = {
                                                    prefs.edit().remove("sessionId").remove("challengeId").remove("settingsChallengeId").commit()
                                                    claims.reset()
                                                    settings = false
                                                    reset++
                                                }) { Text("Start a new age check") }
                                                Button(onClick = { settings = false; refresh++ }) { Text("Back to game") }
                                            }
                                        }
                                    },
                                    pending = { GateMessage("Waiting for your grownup", "Check the email sent by k-ID. Return here after approval.", false) },
                                    prohibited = { GateMessage("Unable to continue", "k-ID says this game is unavailable for this player.", false) },
                                    fail = { GateMessage("Request not approved", "The request was declined or expired. You can try again.", true) },
                                    error = { GateMessage("Could not connect", "Check your connection and try again. Your saved game is safe.", true) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable private fun GateMessage(title: String, detail: String, retry: Boolean) {
        Column(Modifier.fillMaxSize().safeDrawingPadding().padding(28.dp), verticalArrangement = Arrangement.Center) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            Text(detail)
            Button(onClick = { refresh++ }) { Text("Check again") }
            if (retry) TextButton(onClick = {
                prefs.edit().remove("sessionId").remove("challengeId").remove("settingsChallengeId").commit()
                claims.reset()
                reset++
            }) { Text("Start again") }
        }
    }

    fun attach(view: WebView) {
        web = view
        KidBridge.install(view, this)
    }
    fun openSettings() { settings = true }
    fun isPassed(): Boolean = passed
    fun allowed(name: String): Boolean = passed && permissions[PermissionName(name)] == true
    fun proof(): String = if (passed) claims.proof() else ""
    fun claimMessage(): String = claims.message
    private fun notifyPermissions() {
        web?.evaluateJavascript("document.dispatchEvent(new Event('firefly-permissions'))", null)
    }
    fun close(): Boolean {
        if (!settings) return false
        settings = false; refresh++
        return true
    }
    fun destroy() { claims.destroy(); web = null; passed = false }
}
