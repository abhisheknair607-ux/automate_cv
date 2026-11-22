package app.garamaal.browser;

import android.os.Bundle;

/**
 * Temporary Garamaal job-preparation workspace, launched only by a user tap
 * on the Secure Browser's Capture Job action. It runs as a separate task so
 * Apply can close it without navigating/reloading the authenticated browser.
 * The visible WebView is for employer job information, not LinkedIn login.
 */
public final class PreparationActivity extends MainActivity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }
}
