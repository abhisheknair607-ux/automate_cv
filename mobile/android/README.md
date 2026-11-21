# Garamaal Android Job Browser — native MVP

The existing Garamaal **Install app** button installs a PWA using `/manifest.webmanifest`. A PWA cannot inspect cross-origin employer pages loaded in a different origin. This directory starts a **separate Android application** using a native Android `WebView`; it does not replace the website or the existing installer.

## User flow

1. Open Garamaal Browser on Android or **Share → Garamaal Browser** from a job link.
2. Navigate to a secure external employer/ATS vacancy.
3. Tap **Capture this job** after the employer page renders. The extractor reads structured `JobPosting` data or permitted job-description DOM nodes, not LinkedIn pages or application-form answers.
4. Expand the Garamaal Assistant review sheet. **Every field is editable:** employer, title, location, employer application URL and the complete multi-line JD (up to 49,000 characters).
5. Choose **Save Job to Garamaal** or **Save & Make CV**. The native app copies the *edited* full JD to the local clipboard and opens `https://garamaal.web.app/prototype#gm-capture=…` with small metadata, never with the full JD or login tokens.
6. On the authenticated PWA screen select **Import captured JD**, review the fields and explicitly press **Save Job** or **Save & Prepare CV**. These reuse Garamaal's existing `addDiscovery`, `getJob`, `saveDiscovery`, `transferJob` and `updateFreshControl` operations, including existing-URL deduplication and automatic Freshmaal transfer for complete JDs.
7. **Generate CV (paid)** remains separate, with a per-job, per-candidate confirmation. It calls the existing guarded `runCvApiNow` backend and never auto-submits an application or automatically starts paid CV work.

The Android app's Dashboard, Discovery and Make CV buttons open the corresponding Garamaal PWA views. Browser state remains inside the Android app while the user switches to Garamaal.

## Build and test

GitHub Actions runs `.github/workflows/garamaal-android-browser-build.yml`. It checks the handoff JavaScript and builds a **debug APK as an ephemeral workflow artifact**. To build locally, install JDK 17, Android SDK 35 and Gradle 8.11.1, then run from `mobile/android`:

```sh
gradle :app:assembleDebug
```

The debug APK is **not** a production-signed application or Play Store release. GitHub Actions builds may use a different temporary debug certificate, so upgrading over an earlier debug APK may require uninstalling the old test build first (which clears that app's local WebView data). It should not be presented as the main Install app experience. Before publishing an Android installer, validate it on physical phones and configure release signing, app ownership, distribution/updates and user-facing disclosures.

## Android 15 UI and secure sign-in (v0.2.1)

- Reserves the Android status bar, display cutout, three-button navigation bar and on-screen keyboard insets so Garamaal controls are not covered by system UI.
- Replaces oversized grey native bottom buttons with a compact four-tab navigation row above system controls.
- The toolbar exposes **Chrome ↗**. LinkedIn and Google OAuth destinations open in Chrome (or a trusted browser fallback) because Google authentication blocks embedded Android WebViews.
- No browser cookies or OAuth tokens are copied into the native WebView. LinkedIn is used in Chrome; on the employer's external Apply page choose Android **Share → Garamaal Browser** to capture the ATS page.
- Google login to Garamaal itself stays in the existing authenticated PWA/browser. The Android embedded browser cannot reuse Chrome's sign-in cookies.
- The introductory browser screen no longer falsely displays garamaal.web.app in the URL bar.

## Scope and limitations

- Android MVP only; no iOS build.
- User-initiated DOM extraction only on HTTPS external employer/ATS websites where permitted. LinkedIn page extraction is explicitly blocked. Job websites may require per-site selectors and may block or change WebView functionality.
- Current extractor prioritises job titles, companies, locations, description and source URL. Workday/iframes/Shadow DOM and dynamic-SPA behaviours need further adapters and tests.
- This MVP uses the **existing secure PWA auth and Add Job form**, not a new native Firebase login. No credentials are passed through the external job WebView.
- Browser-page Google authentication may be rejected in embedded WebView; use the external-browser fallback where appropriate.
- Uploading CVs uses Android's system file chooser; no autofill, Next/Submit clicks or paid CV generation are triggered by capture.
- For now, adding a job is a **two-step handoff** rather than an automatic write. The production Install PWA remains unchanged.

## Production release gates

1. Confirm the debug APK builds in CI and test on Android devices against Greenhouse, Lever, Ashby, Workday and generic employer pages.
2. Verify all `#gm-capture=` handoff fields prefill correctly and the existing `addDiscovery` operation safely deduplicates.
3. Deploy the additive PWA handoff script via the repository's guarded Cloud Run process and confirm `/prototype/mobile-capture-handoff.js` serves.
4. Sign a release APK/AAB, publish it using an approved distribution channel and **then** add a separate **Install Android Browser** action in Garamaal. Do not silently swap the existing PWA Install button.
