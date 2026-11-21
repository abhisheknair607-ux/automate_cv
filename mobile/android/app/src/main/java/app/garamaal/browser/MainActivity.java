package app.garamaal.browser;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.SafeBrowsingResponse;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Native browser MVP: read only the user's requested employer vacancy page. */
public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 3001;
    private static final String GARAMAAL = "https://garamaal.web.app/prototype";
    private static final int NAVY = Color.rgb(19, 42, 73);
    private static final int BLUE = Color.rgb(37, 99, 235);

    private WebView browser;
    private EditText address;
    private EditText title;
    private EditText company;
    private EditText location;
    private TextView captureStatus;
    private TextView descriptionPreview;
    private LinearLayout review;
    private ValueCallback<Uri[]> pendingUpload;
    private JSONObject captured;
    private String script;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(NAVY);
        getWindow().setNavigationBarColor(NAVY);
        try (InputStream stream = getAssets().open("job_capture.js")) {
            byte[] bytes = new byte[stream.available()];
            int count = 0;
            while (count < bytes.length) {
                int next = stream.read(bytes, count, bytes.length - count);
                if (next < 0) break;
                count += next;
            }
            script = new String(bytes, 0, count, StandardCharsets.UTF_8);
        } catch (Exception error) {
            script = null;
        }
        buildLayout();
        if (state != null) {
            browser.restoreState(state);
        } else if (!openSharedLink(getIntent())) {
            browser.loadDataWithBaseURL("https://garamaal.web.app/",
                "<html><meta name='viewport' content='width=device-width, initial-scale=1'><body style='font:16px system-ui;padding:24px;color:#132a49'>"
                + "<h2>Garamaal Job Browser</h2><p>Paste an external employer or ATS vacancy URL above, or share one into Garamaal Browser from another app.</p>"
                + "<p>Tap <b>Capture this job</b> when the job description has loaded. LinkedIn page extraction is disabled.</p></body></html>",
                "text/html", "utf-8", null);
        }
    }

    private TextView text(String label, int size) {
        TextView view = new TextView(this);
        view.setText(label);
        view.setTextSize(size);
        view.setTextColor(NAVY);
        view.setPadding(dp(12), dp(8), dp(12), dp(8));
        return view;
    }

    private Button button(String label) {
        Button view = new Button(this);
        view.setAllCaps(false);
        view.setText(label);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        setContentView(root);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(5), dp(4), dp(5), dp(4));
        Button back = button("‹");
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(48), dp(48)));
        back.setOnClickListener(v -> { if (browser.canGoBack()) browser.goBack(); });
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(12);
        address.setHint("Paste external job URL");
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
            android.text.InputType.TYPE_TEXT_VARIATION_URI);
        toolbar.addView(address, new LinearLayout.LayoutParams(0, dp(49), 1));
        Button go = button("Go");
        toolbar.addView(go, new LinearLayout.LayoutParams(dp(57), dp(48)));
        go.setOnClickListener(v -> navigate(address.getText().toString()));
        root.addView(toolbar);

        browser = new WebView(this);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Android system file picker grants upload URIs.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme)) return false;
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, "Only secure HTTPS webpages are supported.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                address.setText(url.startsWith("data:") ? "" : url);
                captureStatus.setText("Garamaal Assistant · Capture when the job description is visible");
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView webView,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingUpload != null) pendingUpload.onReceiveValue(null);
                pendingUpload = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER);
                    return true;
                } catch (Exception error) {
                    pendingUpload = null;
                    return false;
                }
            }
        });
        root.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout assistant = new LinearLayout(this);
        assistant.setOrientation(LinearLayout.VERTICAL);
        assistant.setPadding(dp(10), dp(7), dp(10), dp(7));
        assistant.setBackgroundColor(Color.rgb(242, 246, 252));
        assistant.addView(text("Garamaal Assistant", 16));
        captureStatus = text("Open a vacancy to begin", 12);
        assistant.addView(captureStatus);
        Button capture = button("Capture this job");
        assistant.addView(capture);
        capture.setOnClickListener(v -> captureJob());

        review = new LinearLayout(this);
        review.setOrientation(LinearLayout.VERTICAL);
        title = edit("Job title");
        company = edit("Company");
        location = edit("Location");
        review.addView(title);
        review.addView(company);
        review.addView(location);
        descriptionPreview = text("", 12);
        descriptionPreview.setMaxLines(3);
        review.addView(descriptionPreview);
        Button saveJob = button("Save Job to Garamaal");
        review.addView(saveJob);
        saveJob.setOnClickListener(v -> handOffCapture(false));
        Button makeCv = button("Save & Make CV");
        review.addView(makeCv);
        makeCv.setOnClickListener(v -> handOffCapture(true));
        review.setVisibility(View.GONE);
        assistant.addView(review);
        root.addView(assistant);

        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        for (String item : new String[]{"Dashboard", "Discovery", "Browser", "Make CV"}) {
            Button tab = button(item);
            tab.setTextSize(10);
            nav.addView(tab, new LinearLayout.LayoutParams(0, dp(49), 1));
            tab.setOnClickListener(v -> {
                if (!"Browser".equals(item)) {
                    String destination = "Dashboard".equals(item) ? "dashboard" :
                        "Discovery".equals(item) ? "discovery" : "fresh";
                    openGaramaal("#gm-view=" + destination);
                }
            });
        }
        root.addView(nav);
    }

    private EditText edit(String hint) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setTextSize(14);
        return field;
    }

    private void navigate(String raw) {
        String input = raw.trim();
        try {
            Uri uri = Uri.parse(input);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
                throw new IllegalArgumentException();
            }
            captured = null;
            review.setVisibility(View.GONE);
            browser.loadUrl(uri.toString());
        } catch (Exception error) {
            Toast.makeText(this, "Enter a full HTTPS employer vacancy URL.", Toast.LENGTH_LONG).show();
        }
    }

    private void captureJob() {
        if (script == null) {
            captureStatus.setText("Job extractor is unavailable in this build.");
            return;
        }
        Uri uri = Uri.parse(browser.getUrl() == null ? "" : browser.getUrl());
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        if ("linkedin.com".equals(host) || host.endsWith(".linkedin.com")) {
            captureStatus.setText("LinkedIn extraction is disabled. Open the external employer Apply link.");
            return;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            captureStatus.setText("Open an HTTPS employer vacancy to capture it.");
            return;
        }
        captureStatus.setText("Reading job details from this page…");
        browser.evaluateJavascript(script, result -> {
            try {
                Object value = new JSONTokener(result).nextValue();
                JSONObject data = new JSONObject(String.valueOf(value));
                if (data.has("error")) throw new IllegalStateException(data.getString("error"));
                captured = data;
                title.setText(data.optString("title"));
                company.setText(data.optString("company"));
                location.setText(data.optString("location"));
                String jd = data.optString("description");
                descriptionPreview.setText(jd.isEmpty()
                    ? "Description not detected. Paste the JD into Garamaal after opening."
                    : "Captured JD: " + jd.substring(0, Math.min(230, jd.length())) + "…");
                captureStatus.setText(data.optBoolean("missingDescription")
                    ? "Partial capture — review missing job description"
                    : "Captured — review all fields before saving");
                review.setVisibility(View.VISIBLE);
            } catch (Exception error) {
                captureStatus.setText("Capture failed: " + error.getMessage());
                review.setVisibility(View.GONE);
            }
        });
    }

    private void handOffCapture(boolean prepareCv) {
        if (captured == null) return;
        String role = title.getText().toString().trim();
        String employer = company.getText().toString().trim();
        String url = captured.optString("url");
        if (role.isEmpty() || employer.isEmpty() || !url.startsWith("https://")) {
            Toast.makeText(this, "Check job title, company and URL before continuing.", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            String jd = captured.optString("description");
            if (!jd.trim().isEmpty()) {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("Garamaal vacancy description", jd));
            }
            JSONObject payload = new JSONObject();
            payload.put("company", employer);
            payload.put("role", role);
            payload.put("location", location.getText().toString().trim());
            payload.put("url", url);
            payload.put("mode", prepareCv ? "cv" : "save");
            // JD stays on-device/clipboard: URLs should never contain full descriptions.
            String fragment = "#gm-capture=" + Uri.encode(payload.toString());
            openGaramaal(fragment);
        } catch (Exception error) {
            Toast.makeText(this, "Could not prepare the job for Garamaal.", Toast.LENGTH_LONG).show();
        }
    }

    private void openGaramaal(String fragment) {
        // Use Chrome/PWA for its established Firebase Google login session.
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(GARAMAAL + fragment))
            .addCategory(Intent.CATEGORY_BROWSABLE));
    }

    private boolean openSharedLink(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (shared == null) return false;
        Matcher matcher = Pattern.compile("https://[^\\s<>]+").matcher(shared);
        if (!matcher.find()) return false;
        navigate(matcher.group().replaceAll("[.,)]+$", ""));
        return true;
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openSharedLink(intent);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        browser.saveState(state);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FILE_CHOOSER && pendingUpload != null) {
            pendingUpload.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingUpload = null;
        }
    }

    @Override public void onBackPressed() {
        if (review.getVisibility() == View.VISIBLE) review.setVisibility(View.GONE);
        else if (browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingUpload != null) pendingUpload.onReceiveValue(null);
        browser.destroy();
        super.onDestroy();
    }
}
