package com.fireflygrove.game;

import android.app.Application;

public final class FireflyApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        // Unconfigured preview builds must still launch and support guest play.
        // Initialized on explicit cloud access after the native age gate passes.
    }
    boolean isPlayGamesConfigured() {
        return getString(R.string.game_services_project_id).matches("[1-9][0-9]{5,19}");
    }
}
