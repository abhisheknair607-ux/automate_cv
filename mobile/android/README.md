# Garamaal Android Job Browser — native MVP

The existing Garamaal **Install app** button installs a PWA using `/manifest.webmanifest`. A PWA cannot inspect cross-origin employer pages loaded in a different origin. This directory starts a **separate Android application** using a native Android `WebView`; it does not replace the website or the existing installer.

## User flow

1. Open Garamaal Browser on Android or **Share → Garamaal Browser** from a job link.
2. Navigate to a secure external employer/ATS vacancy.
3. Tap **Capture this job** after the page renders; the JS extractor reads `JobPosting` JSON-LD or specific job-description DOM nodes. It does not scrape LinkedIn and does not read form input values, cookies or authentication tokens.
4. Review/edit the detected title, company and location.
5. Tap **Review in Garamaal**. The native app copies the JD, when found, to the local clipboard and opens `https://garamaal.web.app/prototype#gm-capture=…` with only small metadata (not the entire JD).
6. The installed Garamaal PWA/site pre-populates its existing **Add Job** form, offers a **Paste captured JD** button and retains its existing authenticated `addDiscovery` API. **The user reviews and submits the job manually.** The existing Make CV flow remains unchanged.

The Android app's Dashboard, Discovery and Make CV buttons open the corresponding Garamaal PWA views. Browser state remains inside the Android app while the user switches to Garamaal.

## Build and test

GitHub Actions runs `.github/workflows/garamaal-android-browser-build.yml`. It checks the handoff JavaScript and builds a **debug APK as an ephemeral workflow artifact**. To build locally, install JDK 17, Android SDK 35 and Gradle 8.11.1, then run from `mobile/android`:

```sh
gradle :app:assembleDebug
```

The debug APK is **not** a production-signed application or Play Store release. It should not be presented as the main Install app experience. Before publishing an Android installer, validate it on physical phones and configure release signing, app ownership, distribution/updates and user-facing disclosures.

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
