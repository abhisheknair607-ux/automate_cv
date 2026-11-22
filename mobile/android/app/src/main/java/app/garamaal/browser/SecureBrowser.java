package app.garamaal.browser;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
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

    /** Toolbar action bitmap: more compatible than a secondary toolbar alone. */
    private static Bitmap captureIcon() {
        Bitmap icon = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(icon);
        Paint pen = new Paint(Paint.ANTI_ALIAS_FLAG);
        pen.setColor(Color.WHITE);
        pen.setStrokeWidth(3.8f);
        pen.setStrokeCap(Paint.Cap.ROUND);
        pen.setStrokeJoin(Paint.Join.ROUND);
        pen.setStyle(Paint.Style.STROKE);
        canvas.drawRoundRect(9, 6, 39, 42, 4, 4, pen);
        canvas.drawLine(15, 17, 33, 17, pen);
        canvas.drawLine(15, 25, 25, 25, pen);
        canvas.drawLine(29, 29, 29, 39, pen);
        canvas.drawLine(24, 34, 34, 34, pen);
        return icon;
    }

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
            .setShareState(CustomTabsIntent.SHARE_STATE_ON)
            // Chrome adapts the icon tint to light/dark toolbar variants.
            .setActionButton(captureIcon(), "Capture Job in Garamaal",
                pendingCapture, true)
            .setSecondaryToolbarViews(bar, new int[]{R.id.secure_capture_action}, pendingCapture)
            .addMenuItem("Capture job in Garamaal", pendingCapture)
            .build();
        // Brave is the user's default Custom Tab provider; its UI did not
        // display our secondary toolbar. Prefer Chrome for these controls
        // without changing the phone's default browser setting.
        customTab.intent.setPackage("com.android.chrome");
        try {
            customTab.launchUrl(activity, url);
        } catch (ActivityNotFoundException chromeMissing) {
            // Share -> Garamaal Browser is the reliable fallback if this
            // provider also ignores Custom Tabs buttons.
            customTab.intent.setPackage(null);
            customTab.launchUrl(activity, url);
        }
    }
}
