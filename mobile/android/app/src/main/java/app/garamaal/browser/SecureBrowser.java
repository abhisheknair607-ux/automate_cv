package app.garamaal.browser;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import androidx.browser.customtabs.CustomTabsIntent;

/**
 * Chrome Custom Tabs keeps Google/LinkedIn authentication in the Chrome session.
 * A user tap on Capture Job returns only the CURRENT URL to MainActivity;
 * the Chrome DOM, cookies, OAuth tokens and credentials never cross into WebView.
 */
final class SecureBrowser {
    static final String ACTION_CAPTURE = "app.garamaal.browser.CAPTURE_FROM_SECURE_TAB";
    static final String INITIAL_URL = "https://www.linkedin.com/jobs/";

    private SecureBrowser() {}

    static boolean isCaptureIntent(Intent intent) {
        return intent != null && ACTION_CAPTURE.equals(intent.getAction());
    }

    static void open(Activity activity, String rawUrl) {
        Uri url = Uri.parse(rawUrl == null ? "" : rawUrl.trim());
        if (!"https".equalsIgnoreCase(url.getScheme()) || url.getHost() == null) {
            throw new IllegalArgumentException("Secure Browser requires an HTTPS address");
        }

        Intent callback = new Intent(activity, MainActivity.class);
        callback.setAction(ACTION_CAPTURE);
        callback.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // MUTABLE is required: Chrome inserts the currently displayed URL
        // as PendingIntent.data when the user taps the Custom Tab toolbar.
        // The PendingIntent is explicitly addressed only to our Activity.
        PendingIntent pendingCapture = PendingIntent.getActivity(
            activity, 419, callback, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);

        RemoteViews bar = new RemoteViews(activity.getPackageName(), R.layout.secure_capture_toolbar);
        CustomTabsIntent customTab = new CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setToolbarColor(0xff132a49)
            .setSecondaryToolbarViews(bar, new int[]{R.id.secure_capture_action}, pendingCapture)
            .addMenuItem("Capture job in Garamaal", pendingCapture)
            .build();
        customTab.launchUrl(activity, url);
    }
}
