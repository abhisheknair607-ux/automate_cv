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
import android.widget.FrameLayout;
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
public class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 3001;
    private static final String GARAMAAL = "https://garamaal.web.app/prototype";
    private static final int NAVY = Color.rgb(19, 42, 73);
    private static final int BLUE = Color.rgb(37, 99, 235);

    private WebView browser;
    private FrameLayout browserStack;
    private JobCaptureEngine backgroundCapture;
    private Button reviewToggle;
    private String lastSecureUrl = SecureBrowser.INITIAL_URL;
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
    private boolean prepareAutoCapture = false;

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
        if (state != null) browser.restoreState(state);
        if (!openIncomingLink(getIntent()) && state == null) {
            showBrowserHome();
            openSecureBrowser(SecureBrowser.INITIAL_URL);
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
        toolbar.setBackgroundColor(NAVY);
        Button back = button("‹");
        styleButton(back, false);
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(44), dp(46)));
        back.setOnClickListener(v -> { if (browser.canGoBack()) browser.goBack(); });
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(12);
        address.setHint("Secure employer URL");
        address.setTextColor(NAVY);
        address.setHintTextColor(Color.rgb(103, 115, 133));
        address.setPadding(dp(10), dp(5), dp(10), dp(5));
        GradientDrawable addressBackground = new GradientDrawable();
        addressBackground.setColor(Color.WHITE);
        addressBackground.setCornerRadius(dp(9));
        address.setBackground(addressBackground);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
            android.text.InputType.TYPE_TEXT_VARIATION_URI);
        toolbar.addView(address, new LinearLayout.LayoutParams(0, dp(49), 1));
        Button go = button(this instanceof PreparationActivity ? "Open" : "Secure");
        styleButton(go, true);
        go.setTextSize(11);
        toolbar.addView(go, new LinearLayout.LayoutParams(dp(66), dp(46)));
        go.setOnClickListener(v -> {
            if (this instanceof PreparationActivity) navigate(address.getText().toString());
            else openSecureBrowser(address.getText().toString());
        });
        if (!(this instanceof PreparationActivity)) {
            Button external = button("WebView");
            external.setContentDescription("Open typed job in the direct Job Browser for troubleshooting");
            external.setTextSize(10);
            styleButton(external, false);
            LinearLayout.LayoutParams externalParams = new LinearLayout.LayoutParams(dp(76), dp(46));
            externalParams.leftMargin = dp(5);
            toolbar.addView(external, externalParams);
            external.setOnClickListener(v -> navigate(address.getText().toString()));
        }
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
                captureStatus.setText("Garamaal Assistant · Capture or review the employer job");
                if (prepareAutoCapture && JobCaptureEngine.eligible(url)) {
                    prepareAutoCapture = false;
                    view.postDelayed(() -> {
                        if (url.equals(view.getUrl())) captureJob();
                    }, 1400);
                }
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
        browserStack = new FrameLayout(this);
        browserStack.addView(browser, new FrameLayout.LayoutParams(-1, -1));
        root.addView(browserStack, new LinearLayout.LayoutParams(-1, 0, 1));
        backgroundCapture = new JobCaptureEngine(this, browserStack, script);

        LinearLayout assistant = new LinearLayout(this);
        assistant.setOrientation(LinearLayout.VERTICAL);
        assistant.setPadding(dp(12), dp(7), dp(12), dp(7));
        assistant.setBackgroundColor(NAVY);

        LinearLayout assistantTop = new LinearLayout(this);
        assistantTop.setGravity(Gravity.CENTER_VERTICAL);
        TextView assistantTitle = text("Garamaal Assistant", 16);
        assistantTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        assistantTitle.setTextColor(Color.WHITE);
        assistantTop.addView(assistantTitle, new LinearLayout.LayoutParams(0, -2, 1));
        Button toggle = button("Close review");
        reviewToggle = toggle;
        styleButton(toggle, false);
        toggle.setTextSize(11);
        toggle.setVisibility(View.GONE);
        assistantTop.addView(toggle, new LinearLayout.LayoutParams(dp(116), dp(39)));
        assistant.addView(assistantTop);
        captureStatus = text("Open an employer vacancy, then capture the job", 12);
        captureStatus.setTextColor(Color.rgb(221, 233, 247));
        assistant.addView(captureStatus);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        Button capture = button("Capture");
        styleButton(capture, true);
        actions.addView(capture, new LinearLayout.LayoutParams(0, dp(47), 1));
        Button quickMakeCv = button("Make CV");
        styleButton(quickMakeCv, false);
        LinearLayout.LayoutParams quickParams = new LinearLayout.LayoutParams(0, dp(47), 1);
        quickParams.leftMargin = dp(5);
        actions.addView(quickMakeCv, quickParams);
        quickMakeCv.setOnClickListener(v -> {
            if (captured == null) {
                captureStatus.setText("Capture or enter the job details first, then prepare your CV.");
                return;
            }
            setReviewVisible(true);
            reviewToggle.setVisibility(View.VISIBLE);
            reviewToggle.setText("Close review");
            captureStatus.setText("Edit the description, then choose Save & Make CV below.");
        });
        if (this instanceof PreparationActivity) {
            Button apply = button("Apply ↗");
            styleButton(apply, false);
            LinearLayout.LayoutParams applyParams = new LinearLayout.LayoutParams(0, dp(47), 1);
            applyParams.leftMargin = dp(5);
            actions.addView(apply, applyParams);
            apply.setOnClickListener(v -> returnToSecureBrowser());
        }
        assistant.addView(actions);
        capture.setOnClickListener(v -> captureJob());

        review = new LinearLayout(this);
        review.setOrientation(LinearLayout.VERTICAL);
        review.setPadding(dp(8), dp(8), dp(8), dp(10));
        review.setBackgroundColor(Color.WHITE);
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
                if ("Browser".equals(item)) {
                    openSecureBrowser(lastSecureUrl);
                    return;
                }
                String destination = "Dashboard".equals(item) ? "dashboard" :
                    "Discovery".equals(item) ? "discovery" : "fresh";
                openGaramaal("#gm-view=" + destination);
            });
        }
        if (!(this instanceof PreparationActivity)) root.addView(nav);
    }

    /** Google OAuth and LinkedIn sign-in must use a trusted browser, not WebView. */
    private boolean isTrustedBrowserOnly(Uri uri) {
        String host = uri.getHost() == null ? "" :
            uri.getHost().toLowerCase(java.util.Locale.ROOT);
        return host.equals("linkedin.com") || host.endsWith(".linkedin.com") ||
            host.equals("accounts.google.com") || host.equals("oauth2.googleapis.com");
    }

    /** Default mode: Chrome Custom Tab, including Google/LinkedIn sign-in. */
    private void openSecureBrowser(String url) {
        try {
            String target = url == null || url.trim().isEmpty()
                ? SecureBrowser.INITIAL_URL : url.trim();
            Uri uri = Uri.parse(target);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null)
                throw new IllegalArgumentException();
            lastSecureUrl = target;
            address.setText(target);
            captureStatus.setText("Secure Browser · Tap Capture Job on an external employer page.");
            SecureBrowser.open(this, target);
        } catch (Exception error) {
            Toast.makeText(this,
                "Secure Browser unavailable. Check Chrome or use the direct WebView test mode.",
                Toast.LENGTH_LONG).show();
        }
    }

    private void openTrustedBrowser(String url) {
        try {
            Uri uri = Uri.parse(url == null ? "" : url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null)
                throw new IllegalArgumentException();
            openSecureBrowser(uri.toString());
            captureStatus.setText("Chrome Custom Tab handles authentication. Capture is available on external employer pages.");
        } catch (Exception ignored) {
            Toast.makeText(this, "No supported browser available.", Toast.LENGTH_LONG).show();
        }
    }

    /**
     * Launched only after the user taps Capture Job in the Chrome Custom Tab.
     * Chrome supplies its current page URL via the mutable explicit PendingIntent.
     * This is NOT a transfer of Chrome DOM, sign-in state, cookies or history.
     */
    private void captureFromSecureTab(Uri page) {
        if (page == null || !"https".equalsIgnoreCase(page.getScheme()) ||
            page.getHost() == null) {
            captureStatus.setText("No job URL received from Secure Browser. Open an employer vacancy and retry.");
            return;
        }
        String url = page.toString();
        lastSecureUrl = url;
        address.setText(url);
        if (!JobCaptureEngine.eligible(url)) {
            // The LinkedIn session stays inside Chrome. Garamaal never copies
            // its page DOM or sign-in cookies into an Android WebView.
            if (this instanceof PreparationActivity) {
                JSONObject draft = new JSONObject();
                try { draft.put("url", url); } catch (Exception ignored) {}
                showBrowserHome();
                applyCaptureResult(draft,
                    "LinkedIn stays in Secure Browser. Open the external employer Apply page to capture its JD, or use a job already saved in Garamaal.");
            } else {
                captureStatus.setText("Open the employer's external Apply page before capture. LinkedIn DOM access is unavailable.");
            }
            return;
        }
        if (this instanceof PreparationActivity) {
            // Unlike the previous v0.4 hidden extractor, the real employer
            // page is displayed inside our visible WebView preparation stage.
            prepareAutoCapture = true;
            navigate(url);
            return;
        }
        if (backgroundCapture == null) {
            captureStatus.setText("Capture service is unavailable. Use the direct WebView test mode.");
            return;
        }
        captureStatus.setText("Capturing employer job details in a separate WebView…");
        reviewScroll.setVisibility(View.GONE);
        reviewToggle.setVisibility(View.GONE);
        backgroundCapture.capture(url, (job, note) -> {
            applyCaptureResult(job, note);
        });
    }

    /** Finish the preparation-only Android task instead of reloading the job.
     *  The original Chrome Custom Tab remains in the previous browser task.
     *  Individual browser installations may have different task behaviour. */
    private void returnToSecureBrowser() {
        if (this instanceof PreparationActivity) {
            finishAndRemoveTask();
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        } else {
            openSecureBrowser(lastSecureUrl);
        }
    }

    private void applyCaptureResult(JSONObject data, String note) {
        captured = data;
        title.setText(data.optString("title"));
        company.setText(data.optString("company"));
        location.setText(data.optString("location"));
        applicationUrl.setText(data.optString("url"));
        jobDescription.setText(data.optString("description"));
        capturedFromPage = true;
        reviewToggle.setVisibility(View.VISIBLE);
        reviewToggle.setText("Close review");
        setReviewVisible(true);
        captureStatus.setText(note);
        reviewScroll.post(() -> reviewScroll.fullScroll(View.FOCUS_UP));
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
                JSONObject draft = new JSONObject();
                try { draft.put("url", browser.getUrl()); } catch (Exception ignored) {}
                applyCaptureResult(draft,
                    "Automatic capture was incomplete. Enter or paste the job details manually.");
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

    private void showBrowserHome() {
        browser.loadDataWithBaseURL(null,
            "<html><meta name='viewport' content='width=device-width, initial-scale=1'>" +
            "<body style='font:16px system-ui;padding:24px;color:#132a49'>" +
            "<h2>Garamaal Job Browser</h2><p>Open or share an external employer vacancy to capture it.</p>" +
            "<p>For LinkedIn or Google sign-in, open in Chrome and share the external employer Apply link back to Garamaal Browser.</p>" +
            "</body></html>", "text/html", "utf-8", null);
    }

    /** The installed PWA explicitly launches garamaal-browser://open?url=...
     * Never accept arbitrary schemes or auto-save jobs from external intents.
     */
    private boolean openIncomingLink(Intent intent) {
        if (intent == null) return false;
        if (SecureBrowser.isCaptureIntent(intent)) {
            if (browser.getUrl() == null) showBrowserHome();
            captureFromSecureTab(intent.getData());
            return true;
        }
        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri uri = intent.getData();
            if (uri == null || !"garamaal-browser".equalsIgnoreCase(uri.getScheme()) ||
                !"open".equalsIgnoreCase(uri.getHost())) return false;
            String target = uri.getQueryParameter("url");
            if (target == null || target.trim().isEmpty()) {
                if (browser.getUrl() == null) showBrowserHome();
                openSecureBrowser(SecureBrowser.INITIAL_URL);
                return true;
            }
            if (target.length() > 2500) {
                Toast.makeText(this, "This job URL is too long to open.", Toast.LENGTH_LONG).show();
                return true;
            }
            Uri vacancy = Uri.parse(target);
            if (!"https".equalsIgnoreCase(vacancy.getScheme()) || vacancy.getHost() == null ||
                vacancy.getHost().trim().isEmpty()) {
                Toast.makeText(this, "Only HTTPS employer vacancies are supported.", Toast.LENGTH_LONG).show();
                return true;
            }
            openSecureBrowser(target);
            return true;
        }
        return openSharedLink(intent);
    }

    private boolean openSharedLink(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (shared == null) return false;
        Matcher matcher = Pattern.compile("https://[^\\s<>]+").matcher(shared);
        if (!matcher.find()) return false;
        String sharedUrl = matcher.group().replaceAll("[.,)]+$", "");
        // Share -> Garamaal is user-initiated and works even if Brave hides
        // the Custom Tabs toolbar and menu action. Never read browser cookies.
        if (JobCaptureEngine.eligible(sharedUrl)) {
            captureFromSecureTab(Uri.parse(sharedUrl));
        } else {
            openSecureBrowser(sharedUrl);
            captureStatus.setText("LinkedIn/Google pages are not extracted. Share the external employer Apply page instead.");
        }
        return true;
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openIncomingLink(intent);
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
        else if (this instanceof PreparationActivity) returnToSecureBrowser();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingUpload != null) pendingUpload.onReceiveValue(null);
        if (backgroundCapture != null) backgroundCapture.dispose();
        browser.destroy();
        super.onDestroy();
    }
}
