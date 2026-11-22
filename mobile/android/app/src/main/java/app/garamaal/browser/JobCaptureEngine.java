package app.garamaal.browser;

import android.app.Activity;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * Loads the user-selected external employer URL in a separate DOM WebView.
 * The WebView is visually behind Garamaal UI, never sharing Chrome cookies.
 * Capture is explicitly user initiated, read only, and never submits forms.
 *
 * A hidden WebView is best effort: some websites reject it, require Chrome
 * cookies or lazy-render content. All failure paths return editable fields.
 */
final class JobCaptureEngine {
    interface Callback {
        void onResult(JSONObject job, String message);
    }
    private static final long TIMEOUT_MS = 16000;
    private final Activity activity;
    private final FrameLayout container;
    private final String script;
    private WebView worker;
    private int generation = 0;

    JobCaptureEngine(Activity activity, FrameLayout container, String script) {
        this.activity = activity;
        this.container = container;
        this.script = script;
    }

    static boolean eligible(String raw) {
        if (raw == null || raw.length() > 2500) return false;
        Uri uri = Uri.parse(raw);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) return false;
        String h = uri.getHost().toLowerCase(java.util.Locale.ROOT);
        return !(
            h.equals("linkedin.com") || h.endsWith(".linkedin.com") ||
            h.equals("accounts.google.com") || h.equals("oauth2.googleapis.com") ||
            h.equals("garamaal.web.app") || h.endsWith(".garamaal.web.app") ||
            h.equals("drive.google.com") || h.equals("docs.google.com"));
    }

    private JSONObject empty(String url) {
        JSONObject result = new JSONObject();
        try {
            result.put("url", url);
            result.put("title", "");
            result.put("company", "");
            result.put("location", "");
            result.put("description", "");
            result.put("missingDescription", true);
        } catch (Exception ignored) {}
        return result;
    }

    void capture(String url, Callback callback) {
        dispose();
        final int serial = ++generation;
        if (!eligible(url)) {
            callback.onResult(empty(url),
                "LinkedIn/Google pages are not extracted. Open the external employer Apply link, or enter the details manually.");
            return;
        }
        if (script == null || script.trim().isEmpty()) {
            callback.onResult(empty(url), "Extractor unavailable. You can enter the job details manually.");
            return;
        }
        WebView view = new WebView(activity);
        worker = view;
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSafeBrowsingEnabled(true);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        view.setFocusable(false);
        view.setClickable(false);
        // The WebView is attached at full viewport size behind the normal
        // opaque browser surface so DOM-heavy sites can render normally.
        container.addView(view, 0, new FrameLayout.LayoutParams(-1, -1));

        final boolean[] complete = {false};
        Runnable timeout = () -> {
            if (serial != generation || complete[0]) return;
            complete[0] = true;
            callback.onResult(empty(url),
                "Capture timed out. The secure browser is unchanged; review or paste the job details manually.");
            dispose();
        };
        view.postDelayed(timeout, TIMEOUT_MS);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest req) {
                // Never follow redirected top-level navigation into login pages.
                return req.isForMainFrame() && !eligible(req.getUrl().toString());
            }
            @Override public void onPageFinished(WebView webView, String finishedUrl) {
                if (serial != generation || complete[0]) return;
                if (!eligible(finishedUrl)) return;
                // Give client-side ATS pages a moment to insert JobPosting DOM.
                webView.postDelayed(() -> {
                    if (serial != generation || complete[0]) return;
                    webView.evaluateJavascript(script, response -> {
                        if (serial != generation || complete[0]) return;
                        complete[0] = true;
                        JSONObject result = empty(url);
                        String note = "Captured from external employer page. Review all fields before saving.";
                        try {
                            String json = String.valueOf(new JSONTokener(response).nextValue());
                            result = new JSONObject(json);
                            if (result.has("error")) throw new IllegalStateException(result.optString("error"));
                            // Preserve the explicit secure-browser URL for user review.
                            result.put("url", url);
                            if (result.optString("description").length() < 80)
                                note = "Partial capture. The job description is missing or requires login. Edit or paste the JD.";
                        } catch (Exception problem) {
                            result = empty(url);
                            note = "This employer page could not be read. Enter or paste the job details manually.";
                        }
                        callback.onResult(result, note);
                        dispose();
                    });
                }, 1300);
            }
        });
        view.loadUrl(url);
    }

    void dispose() {
        generation++;
        if (worker != null) {
            WebView old = worker;
            worker = null;
            try {
                old.stopLoading();
                old.loadUrl("about:blank");
                container.removeView(old);
                old.destroy();
            } catch (Exception ignored) {}
        }
    }
}
