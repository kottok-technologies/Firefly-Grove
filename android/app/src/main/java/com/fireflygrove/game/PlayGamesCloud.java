package com.fireflygrove.game;

import android.app.Activity;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotContents;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import com.google.android.gms.tasks.Tasks;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Private Play Games snapshots. No arbitrary Java object is exposed to scripts. */
final class PlayGamesCloud {
    private static final String SLOT = "firefly-grove-progress-v1";
    private final Activity activity;
    private final SharedPreferences preferences;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final boolean configured;
    private boolean busy, destroyed;
    private int epoch;
    private Session session;
    private String playerId = "", playerName = "";

    private static final class Session {
        final String id = UUID.randomUUID().toString();
        final String accountId;
        final SnapshotsClient.DataOrConflict<Snapshot> result;
        Session(SnapshotsClient.DataOrConflict<Snapshot> result, String accountId) { this.result = result; this.accountId = accountId; }
        Snapshot primary() { return result.isConflict() ? result.getConflict().getSnapshot() : result.getData(); }
    }
    PlayGamesCloud(Activity activity, WebView web) {
        this.activity = activity;
        preferences = activity.getSharedPreferences("firefly_cloud", Activity.MODE_PRIVATE);
        configured = ((FireflyApplication) activity.getApplication()).isPlayGamesConfigured();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "FireflyCloud", Collections.singleton(CloudBridgePolicy.ORIGIN), this::receive);
        }
    }
    private JSONObject status() throws JSONException {
        return new JSONObject().put("available", configured).put("enabled", preferences.getBoolean("enabled", false))
            .put("account", preferences.getString("accountName", ""));
    }
    private void reply(JavaScriptReplyProxy proxy, String id, JSONObject values) {
        if (destroyed || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        try { proxy.postMessage(values.put("id", id).put("ok", true).toString()); }
        catch (JSONException | IllegalStateException ignored) { /* The requesting page may have closed. */ }
    }
    private void fail(JavaScriptReplyProxy proxy, String id, String message) {
        if (destroyed || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        try { proxy.postMessage(new JSONObject().put("id", id).put("ok", false).put("error", message)
            .put("enabled", preferences.getBoolean("enabled", false)).toString()); }
        catch (JSONException | IllegalStateException ignored) { /* No save is altered by a lost reply. */ }
    }
    private void receive(WebView view, WebMessageCompat message, Uri origin, boolean mainFrame, JavaScriptReplyProxy proxy) {
        if (!CloudBridgePolicy.allowed(origin.toString(), mainFrame) || message.getType() != WebMessageCompat.TYPE_STRING) return;
        String id = "";
        try {
            String text = message.getData();
            if (text == null || text.length() > CloudBridgePolicy.MAX_BYTES * 2) return;
            JSONObject request = new JSONObject(text);
            id = request.optString("id"); String operation = request.optString("operation");
            if (!CloudBridgePolicy.validRequest(id, operation)) return;
            if (operation.equals("status")) { reply(proxy, id, status()); return; }
            if (operation.equals("cancel") || operation.equals("disconnect")) {
                epoch++; busy = false; discardSession();
                if (operation.equals("disconnect")) preferences.edit().putBoolean("enabled", false).apply();
                reply(proxy, id, status()); return;
            }
            if (!configured) { fail(proxy, id, "Google Play cloud saves are not configured for this build."); return; }
            if (busy) { fail(proxy, id, "A cloud save request is already running. Please wait."); return; }
            busy = true;
            if (operation.equals("read")) open(request.optBoolean("interactive"), proxy, id);
            else {
                if (session == null || !session.id.equals(request.optString("session"))) throw new JSONException("Expired snapshot session");
                finishForCurrentAccount(operation, request.optString("data"), proxy, id);
            }
        } catch (JSONException | IllegalArgumentException invalid) {
            busy = false; fail(proxy, id, "The cloud save request expired or was invalid. Your device save is safe.");
        }
    }
    private SnapshotsClient snapshots() { return PlayGames.getSnapshotsClient(activity); }
    private void finishForCurrentAccount(String operation, String data, JavaScriptReplyProxy proxy, String id) {
        final int requestEpoch = epoch;
        final String accountId = session.accountId;
        // Account settings can change while a save-choice dialog is open.
        // Recheck before writing, resolving a conflict, or enabling cloud sync.
        PlayGames.getGamesSignInClient(activity).isAuthenticated().continueWithTask(auth -> {
            if (!auth.isSuccessful() || !auth.getResult().isAuthenticated()) return Tasks.forException(new IllegalStateException("Sign in required"));
            return PlayGames.getPlayersClient(activity).getCurrentPlayer();
        }).addOnSuccessListener(player -> {
            if (!current(requestEpoch)) return;
            if (!accountId.equals(player.getPlayerId())) {
                preferences.edit().putBoolean("enabled", false).apply();busy = false;discardSession();
                fail(proxy, id, "The Play Games account changed. Link it again in Settings to choose your save.");return;
            }
            try {
                if (operation.equals("write")) write(data, proxy, id); else adopt(proxy, id);
            } catch (JSONException | IllegalArgumentException invalid) {
                busy = false;fail(proxy, id, "The cloud save request expired or was invalid. Your device save is safe.");
            }
        }).addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
    }
    private void open(boolean interactive, JavaScriptReplyProxy proxy, String id) {
        discardSession(); final int requestEpoch = ++epoch;
        PlayGames.getGamesSignInClient(activity).isAuthenticated().continueWithTask(task -> {
            if (task.isSuccessful() && task.getResult().isAuthenticated()) return Tasks.forResult(true);
            if (!interactive) return Tasks.forException(new IllegalStateException("Sign in required"));
            return PlayGames.getGamesSignInClient(activity).signIn().continueWith(signed -> {
                if (!signed.isSuccessful() || !signed.getResult().isAuthenticated()) throw new IllegalStateException("Sign in cancelled");
                return true;
            });
        }).continueWithTask(auth -> {
            if (!auth.isSuccessful()) return Tasks.forException(new IllegalStateException("Sign in required"));
            return PlayGames.getPlayersClient(activity).getCurrentPlayer();
        }).addOnSuccessListener(player -> {
            if (!current(requestEpoch)) return;
            playerId = player.getPlayerId(); playerName = player.getDisplayName();
            boolean linked = preferences.getBoolean("enabled", false);
            if ((!interactive && !linked) || (linked && !playerId.equals(preferences.getString("accountId", "")))) {
                preferences.edit().putBoolean("enabled", false).apply(); busy = false;
                fail(proxy, id, "The Play Games account changed. Link it again in Settings to choose your save."); return;
            }
            snapshots().open(SLOT, true, SnapshotsClient.RESOLUTION_POLICY_MANUAL)
                .addOnSuccessListener(result -> {
                    if (!current(requestEpoch)) { discardResult(result); return; }
                    deliver(result, requestEpoch, proxy, id);
                }).addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
        }).addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
    }
    private boolean current(int requestEpoch) { return !destroyed && requestEpoch == epoch; }
    private void requestFailed(int requestEpoch, JavaScriptReplyProxy proxy, String id) {
        if (!current(requestEpoch)) return;
        busy = false; discardSession();
        fail(proxy, id, "Google Play could not connect. Check your connection and Play Games account, then retry. Your device save is safe.");
    }
    private String contents(Snapshot snapshot) throws Exception {
        byte[] bytes = snapshot.getSnapshotContents().readFully();
        if (bytes.length > CloudBridgePolicy.MAX_BYTES) throw new IllegalArgumentException("Save too large");
        return new String(bytes, StandardCharsets.UTF_8);
    }
    private void deliver(SnapshotsClient.DataOrConflict<Snapshot> result, int requestEpoch, JavaScriptReplyProxy proxy, String id) {
        Session opened = new Session(result, playerId); session = opened;
        Tasks.call(io, () -> {
            JSONArray saves = new JSONArray().put(new JSONObject().put("key", "cloud").put("data", contents(opened.primary())));
            if (result.isConflict()) saves.put(new JSONObject().put("key", "alternative").put("data", contents(result.getConflict().getConflictingSnapshot())));
            return new JSONObject().put("session", opened.id).put("account", playerName).put("saves", saves);
        }).addOnSuccessListener(data -> {
            if (!current(requestEpoch)) return;
            busy = false; reply(proxy, id, data);
        }).addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
    }
    private void write(String data, JavaScriptReplyProxy proxy, String id) throws JSONException {
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        JSONObject envelope = new JSONObject(data);
        if (bytes.length > CloudBridgePolicy.MAX_BYTES || !"firefly-cloud-v1".equals(envelope.optString("format"))) throw new JSONException("Invalid save");
        int level = envelope.getJSONObject("state").getInt("level");
        if (level < 1 || level > 1000000) throw new JSONException("Invalid level");
        Session writing = session; final int requestEpoch = epoch;
        SnapshotMetadataChange change = new SnapshotMetadataChange.Builder().setDescription("Firefly Grove · Level " + level).setProgressValue(level - 1).build();
        Tasks.call(io, () -> {
            SnapshotContents output = writing.result.isConflict() ? writing.result.getConflict().getResolutionSnapshotContents() : writing.primary().getSnapshotContents();
            if (!output.writeBytes(bytes)) throw new IllegalStateException("Write failed");
            return output;
        }).addOnSuccessListener(output -> {
            if (!current(requestEpoch)) return;
            if (writing.result.isConflict()) {
                snapshots().resolveConflict(writing.result.getConflict().getConflictId(), writing.primary().getMetadata().getSnapshotId(), change, output)
                    .addOnSuccessListener(result -> {
                        if (!current(requestEpoch)) { discardResult(result); return; }
                        session = null;
                        if (result.isConflict()) deliver(result, requestEpoch, proxy, id);
                        else snapshots().discardAndClose(result.getData()).addOnSuccessListener(ignored -> completed(requestEpoch, proxy, id))
                            .addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
                    }).addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
            } else {
                snapshots().commitAndClose(writing.primary(), change).addOnSuccessListener(metadata -> {
                    if (!current(requestEpoch)) return;
                    session = null; completed(requestEpoch, proxy, id);
                }).addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
            }
        }).addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
    }
    private void adopt(JavaScriptReplyProxy proxy, String id) throws JSONException {
        if (session.result.isConflict()) throw new JSONException("Choose a conflict winner before adopting");
        final int requestEpoch = epoch; Snapshot snapshot = session.primary(); session = null;
        snapshots().discardAndClose(snapshot).addOnSuccessListener(ignored -> completed(requestEpoch, proxy, id))
            .addOnFailureListener(error -> requestFailed(requestEpoch, proxy, id));
    }
    private void completed(int requestEpoch, JavaScriptReplyProxy proxy, String id) {
        if (!current(requestEpoch)) return;
        busy = false; preferences.edit().putBoolean("enabled", true).putString("accountId", playerId).putString("accountName", playerName).apply();
        try { reply(proxy, id, status()); } catch (JSONException ignored) { /* Fixed status fields. */ }
    }
    private void discardResult(SnapshotsClient.DataOrConflict<Snapshot> result) {
        if (result.isConflict()) {
            snapshots().discardAndClose(result.getConflict().getSnapshot());
            snapshots().discardAndClose(result.getConflict().getConflictingSnapshot());
        } else snapshots().discardAndClose(result.getData());
    }
    private void discardSession() { if (session != null) { discardResult(session.result); session = null; } }
    void destroy() { destroyed = true; epoch++; discardSession(); io.shutdown(); }
}
