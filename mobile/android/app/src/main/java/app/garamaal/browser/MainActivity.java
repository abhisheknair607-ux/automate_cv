package app.garamaal.browser;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.Gravity;
import android.view.WindowInsets;
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
import android.widget.ScrollView;
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
    private EditText applicationUrl;
    private EditText jobDescription;
    private ScrollView reviewScroll;
    private LinearLayout review;
    private ValueCallback<Uri[]> pendingUpload;
    private JSONObject captured;
    private String script;
    private boolean capturedFromPage = false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
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
            browser.loadDataWithBaseURL(null,
                "<html><meta name='viewport' content='width=device-width, initial-scale=1'><body style='font:16px system-ui;padding:24px;color:#132a49'>"
                + "<h2>Garamaal Job Browser</h2><p>Paste or share an external employer vacancy to browse and capture its details.</p>"
                + "<p>For LinkedIn or Google sign-in, tap <b>Open in Chrome</b> (↗). After opening an external employer Apply link, Share the link back to Garamaal Browser.</p></body></html>",
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

    private void styleButton(Button view, boolean primary) {
        GradientDrawable surface = new GradientDrawable();
        surface.setColor(primary ? BLUE : Color.WHITE);
        surface.setCornerRadius(dp(12));
        if (!primary) surface.setStroke(dp(1), Color.rgb(196, 210, 229));
        view.setBackground(surface);
        view.setTextColor(primary ? Color.WHITE : NAVY);
        view.setTextSize(13);
        view.setAllCaps(false);
        view.setPadding(dp(12), dp(8), dp(12), dp(8));
    }

    private TextView label(String name) {
        TextView view = text(name.toUpperCase(java.util.Locale.ROOT), 10);
        view.setTextColor(Color.rgb(97, 112, 132));
        view.setPadding(dp(8), dp(6), dp(8), 0);
        return view;
    }

    private void addEditField(LinearLayout parent, String caption, EditText field) {
        parent.addView(label(caption));
        parent.addView(field, new LinearLayout.LayoutParams(-1, -2));
    }

    private void setReviewVisible(boolean visible) {
        reviewScroll.setVisibility(visible ? View.VISIBLE : View.GONE);
        if (visible) captureStatus.setText("Review extracted fields • Edit anything before saving");
    }

    /** Android 15 requires explicit padding for status/navigation bars and IME. */
    private void applySafeAreaInsets(LinearLayout root) {
        if (Build.VERSION.SDK_INT < 35) return;
        root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right,
                Math.max(bars.bottom, ime.bottom));
            return windowInsets;
        });
        root.requestApplyInsets();
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        setContentView(root);
        applySafeAreaInsets(root);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(5), dp(4), dp(5), dp(4));
        Button back = button("‹");
        styleButton(back, false);
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(44), dp(46)));
        back.setOnClickListener(v -> { if (browser.canGoBack()) browser.goBack(); });
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(12);
        address.setHint("Paste external job URL");
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
            android.text.InputType.TYPE_TEXT_VARIATION_URI);
        toolbar.addView(address, new LinearLayout.LayoutParams(0, dp(49), 1));
        Button go = button("Go");
        styleButton(go, true);
        toolbar.addView(go, new LinearLayout.LayoutParams(dp(50), dp(46)));
        go.setOnClickListener(v -> navigate(address.getText().toString()));
        Button external = button("Chrome ↗");
        external.setContentDescription("Open in Chrome for LinkedIn or Google sign-in");
        external.setTextSize(11);
        styleButton(external, false);
        LinearLayout.LayoutParams externalParams = new LinearLayout.LayoutParams(dp(78), dp(46));
        externalParams.leftMargin = dp(5);
        toolbar.addView(external, externalParams);
        external.setOnClickListener(v -> {
            String typed = address.getText().toString().trim();
            String current = browser.getUrl();
            openTrustedBrowser(typed.startsWith("https://") ? typed : current);
        });
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
                if (!request.isForMainFrame()) return false;
                if (isTrustedBrowserOnly(uri)) {
                    openTrustedBrowser(uri.toString());
                    return true;
                }
                if ("https".equalsIgnoreCase(uri.getScheme())) return false;
                Toast.makeText(MainActivity.this,
                    "Only secure HTTPS employer websites are supported here.",
                    Toast.LENGTH_LONG).show();
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                address.setText(url.startsWith("data:") || url.startsWith("about:") ? "" : url);
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
        assistant.setPadding(dp(12), dp(7), dp(12), dp(7));
        assistant.setBackgroundColor(Color.rgb(246, 248, 252));

        LinearLayout assistantTop = new LinearLayout(this);
        assistantTop.setGravity(Gravity.CENTER_VERTICAL);
        TextView assistantTitle = text("Garamaal Assistant", 16);
        assistantTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        assistantTop.addView(assistantTitle, new LinearLayout.LayoutParams(0, -2, 1));
        Button toggle = button("Close review");
        styleButton(toggle, false);
        toggle.setTextSize(11);
        toggle.setVisibility(View.GONE);
        assistantTop.addView(toggle, new LinearLayout.LayoutParams(dp(116), dp(39)));
        assistant.addView(assistantTop);
        captureStatus = text("Open an employer vacancy, then capture the job", 12);
        captureStatus.setTextColor(Color.rgb(97, 112, 132));
        assistant.addView(captureStatus);

        Button capture = button("Capture this job");
        styleButton(capture, true);
        assistant.addView(capture, new LinearLayout.LayoutParams(-1, dp(48)));
        capture.setOnClickListener(v -> captureJob());

        review = new LinearLayout(this);
        review.setOrientation(LinearLayout.VERTICAL);
        review.setPadding(dp(8), dp(8), dp(8), dp(10));
        review.addView(text("Captured job details — all fields editable", 14));

        title = edit("Enter exact job title");
        company = edit("Enter employer name");
        location = edit("Enter job location");
        applicationUrl = edit("https://employer.example/jobs/...");
        applicationUrl.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
            android.text.InputType.TYPE_TEXT_VARIATION_URI);
        addEditField(review, "Job title", title);
        addEditField(review, "Company", company);
        addEditField(review, "Location", location);
        addEditField(review, "Application URL", applicationUrl);

        jobDescription = edit("Paste or correct the full job description here");
        jobDescription.setSingleLine(false);
        jobDescription.setMinLines(5);
        jobDescription.setMaxLines(9);
        jobDescription.setGravity(Gravity.TOP | Gravity.START);
        jobDescription.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
            android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE |
            android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        addEditField(review, "Full job description", jobDescription);

        TextView explanation = text("Your edits are used when saving the job. Missing details can be entered manually. CV generation is never automatic.", 11);
        explanation.setTextColor(Color.rgb(90, 109, 134));
        review.addView(explanation);

        Button saveJob = button("Save Job to Garamaal");
        styleButton(saveJob, true);
        LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(-1, dp(46));
        saveParams.topMargin = dp(8);
        review.addView(saveJob, saveParams);
        saveJob.setOnClickListener(v -> handOffCapture(false));

        Button makeCv = button("Save & Make CV");
        styleButton(makeCv, false);
        LinearLayout.LayoutParams makeParams = new LinearLayout.LayoutParams(-1, dp(46));
        makeParams.topMargin = dp(6);
        review.addView(makeCv, makeParams);
        makeCv.setOnClickListener(v -> handOffCapture(true));

        reviewScroll = new ScrollView(this);
        reviewScroll.setFillViewport(false);
        reviewScroll.setVerticalScrollBarEnabled(true);
        reviewScroll.addView(review);
        reviewScroll.setVisibility(View.GONE);
        assistant.addView(reviewScroll, new LinearLayout.LayoutParams(-1, dp(360)));
        toggle.setOnClickListener(v -> {
            boolean show = reviewScroll.getVisibility() != View.VISIBLE;
            setReviewVisible(show);
            toggle.setText(show ? "Close review" : "Edit capture");
        });
        capture.setOnClickListener(v -> {
            captureJob();
            toggle.setVisibility(View.VISIBLE);
            toggle.setText("Close review");
        });
        root.addView(assistant);

        View separator = new View(this);
        separator.setBackgroundColor(Color.rgb(223, 231, 241));
        root.addView(separator, new LinearLayout.LayoutParams(-1, dp(1)));
        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(6), dp(4), dp(6), dp(5));
        nav.setBackgroundColor(Color.WHITE);
        String[] destinations = {"Dashboard", "Discovery", "Browser", "Make CV"};
        String[] symbols = {"⌂", "▦", "◎", "▤"};
        for (int i = 0; i < destinations.length; i++) {
            final String item = destinations[i];
            TextView tab = text(symbols[i] + "\n" + item, 11);
            tab.setGravity(Gravity.CENTER);
            tab.setTypeface(null, item.equals("Browser") ?
                android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
            tab.setTextColor(item.equals("Browser") ? BLUE : NAVY);
            tab.setPadding(dp(2), dp(3), dp(2), dp(3));
            nav.addView(tab, new LinearLayout.LayoutParams(0, dp(53), 1));
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

    /** Google OAuth and LinkedIn sign-in must use a trusted browser, not WebView. */
    private boolean isTrustedBrowserOnly(Uri uri) {
        String host = uri.getHost() == null ? "" :
            uri.getHost().toLowerCase(java.util.Locale.ROOT);
        return host.equals("linkedin.com") || host.endsWith(".linkedin.com") ||
            host.equals("accounts.google.com") || host.equals("oauth2.googleapis.com");
    }

    private void openTrustedBrowser(String url) {
        try {
            Uri uri = Uri.parse(url == null ? "" : url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null)
                throw new IllegalArgumentException();
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
            browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            // Browser-based login preserves provider security policies; no
            // user-agent spoofing, cookie injection or WebView OAuth attempts.
            browserIntent.setPackage("com.android.chrome");
            try {
                startActivity(browserIntent);
            } catch (android.content.ActivityNotFoundException noChrome) {
                browserIntent.setPackage(null);
                startActivity(browserIntent);
            }
            captureStatus.setText("Secure sign-in opened in Chrome. Share an employer Apply link back to Garamaal Browser.");
        } catch (Exception ignored) {
            Toast.makeText(this, "No supported browser available.", Toast.LENGTH_LONG).show();
        }
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
            if (isTrustedBrowserOnly(uri)) {
                openTrustedBrowser(uri.toString());
                return;
            }
            captured = null;
            capturedFromPage = false;
            reviewScroll.setVisibility(View.GONE);
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
                applicationUrl.setText(data.optString("url"));
                jobDescription.setText(data.optString("description"));
                capturedFromPage = true;
                captureStatus.setText(data.optBoolean("missingDescription")
                    ? "Partial capture — review missing job description"
                    : "Captured — review all fields before saving");
                setReviewVisible(true);
            } catch (Exception error) {
                captureStatus.setText("Capture failed: " + error.getMessage());
                reviewScroll.setVisibility(View.GONE);
            }
        });
    }

    private void handOffCapture(boolean prepareCv) {
        if (captured == null) return;
        String role = title.getText().toString().trim();
        String employer = company.getText().toString().trim();
        String url = applicationUrl.getText().toString().trim();
        Uri checked = Uri.parse(url);
        String hostname = checked.getHost() == null ? "" : checked.getHost().toLowerCase(java.util.Locale.ROOT);
        if (role.isEmpty() || employer.isEmpty() ||
            !"https".equalsIgnoreCase(checked.getScheme()) ||
            hostname.isEmpty() || "linkedin.com".equals(hostname) || hostname.endsWith(".linkedin.com")) {
            Toast.makeText(this, "Check job title, company and URL before continuing.", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            String jd = jobDescription.getText().toString().trim();
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            // Clear any stale prior description when no JD was captured or entered.
            clipboard.setPrimaryClip(ClipData.newPlainText("Garamaal vacancy description", jd));
            JSONObject payload = new JSONObject();
            payload.put("company", employer);
            payload.put("role", role);
            payload.put("location", location.getText().toString().trim());
            payload.put("url", url);
            payload.put("mode", prepareCv ? "cv" : "save");
            payload.put("jdAvailable", jd.length() >= 80);
            payload.put("edited", capturedFromPage);
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
        if (reviewScroll.getVisibility() == View.VISIBLE) reviewScroll.setVisibility(View.GONE);
        else if (browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingUpload != null) pendingUpload.onReceiveValue(null);
        browser.destroy();
        super.onDestroy();
    }
}
