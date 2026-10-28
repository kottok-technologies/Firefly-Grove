package com.fireflygrove.game;

import android.app.Application;
import com.google.android.gms.games.PlayGamesSdk;

public final class FireflyApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        // Unconfigured preview builds must still launch and support guest play.
        if (isPlayGamesConfigured()) PlayGamesSdk.initialize(this);
    }
    boolean isPlayGamesConfigured() {
        return getString(R.string.game_services_project_id).matches("[1-9][0-9]{5,19}");
    }
}
