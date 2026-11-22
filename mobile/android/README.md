# Garamaal Android Job Browser — native MVP

## Secure → Prepare in WebView → Apply in Secure prototype (v0.5.0)

- Installed Garamaal Android PWA employer **and LinkedIn job links** are routed into the native Garamaal Secure Browser (once the website bridge changes are deployed); ordinary LinkedIn sign-in/feed/messaging links, desktop and iOS remain untouched.
- Secure Browser (Chrome Custom Tabs) is the first view. The existing Capture Job action launches a **separate private Garamaal PreparationActivity**, rather than clearing the secure Chrome task.
- PreparationActivity uses the **same navy Garamaal toolbar theme**, a white address field, a real visible employer WebView and a matching navy Garamaal Assistant. It exposes **Capture**, **Make CV**, **Apply**, editable JD review, **Save Job**, **Save & Make CV**, and **Open Saved Jobs & CVs**. Pressing Capture on a public employer site reads its existing DOM. There is no automatic form submission or paid CV generation.
- **Apply** closes only the preparation task via `finishAndRemoveTask()` and returns to the underlying browser task if Android preserves it. It **does not explicitly reopen or reload the Chrome URL**. Android task switching/Custom Tabs behavior must still be verified on physical devices.
- **Chrome LinkedIn cookies are not accessible in WebView**; for a LinkedIn page, preparation shows a blank/manual capture draft and a link to existing Garamaal Make CV records rather than pretending to display authenticated LinkedIn. For public external employer pages, the actual employer URL loads in WebView. Matching the navy toolbar does not guarantee pixel-perfect page rendering if the browser/page sessions differ.
- The existing handoff to the authenticated PWA remains in place for Save Job and CV preparation. The dedicated native browser APK is still a prototype: work performed in the PWA can open another Chrome activity; user-return experience and saved-job integration need device testing.
- **No advanced Secure Browser autofill** has been added in this version. Android's basic browser/autofill remains unchanged.
- This is a test APK only. Neither GitHub main nor live Cloud Run is deployed by creating this branch.



## Secure Browser capture-controls fix (v0.4.1)

- An Android device with Brave as its default browser can open Garamaal as a Brave Custom Tab. Brave did not display the existing secondary bottom Capture Job toolbar in user testing.
- **v0.4.1 prefers Chrome Custom Tabs**, without changing the Android system-wide default browser. The top toolbar has a Capture Job icon, the bottom toolbar has Capture Job when supported, and the three-dot menu includes Capture job in Garamaal when the browser supports menu customisation.
- **Guaranteed user-operated fallback:** from any supported browser, tap **Share → Garamaal Browser** on the external employer job page. The native app now immediately attempts job DOM extraction from that shared HTTPS URL and displays the editable review; it does not merely reopen Secure Browser.
- If Chrome is absent or a browser declines to render Custom Tabs actions, the user may still use the system Share action. Browser providers can choose which controls to render; no one app can force a custom floating overlay over the browser.
- Chrome and Brave keep **separate sign-in cookies**. After switching from Brave to Chrome, the user may need to sign into LinkedIn once more in Chrome. Garamaal does not transfer session tokens or bypass OAuth.
- Test on the previously supplied EY careers page as well as Greenhouse/Lever; confirm the Capture icon, Share fallback, review fields, and return navigation.

## Secure Browser + background DOM capture prototype (v0.4.0)

- **Secure Browser is the default**. Launching the native app opens a Chrome Custom Tab starting at LinkedIn Jobs. The user can sign in with Google/LinkedIn in Chrome; these cookies are never shared with the Android WebView.
- The Custom Tab shows **Capture Job · Garamaal** on its secondary (bottom) toolbar when supported, with a **Capture job in Garamaal** menu-item fallback. This action uses a user-initiated mutable, explicit `PendingIntent` to return the **current page URL** to Garamaal.
- The app briefly comes to the foreground, starts an attached but visually occluded WebView to load the *same URL* from scratch, waits for employer JS and executes the existing read-only JSON-LD/DOM extractor. It does not copy browser cookies, bypass login or scrape LinkedIn.
- If the page is public and supported, job title, employer, location, URL and full JD appear in the existing **scrollable editable review panel** with **Save Job** and **Save & Make CV** actions. The latter still hands off to Garamaal's authenticated PWA workspace; no paid CV generation starts until separately confirmed.
- If capture is partial, times out, or the site blocks WebView, the review shows editable blank/partial fields for the employer URL, with clear manual-entry guidance. On LinkedIn/Google pages themselves, extraction is blocked and users should first open an external employer Apply page.
- The Chrome Custom Tab remains a separate browser activity/session. The native review screen cannot literally overlay the Custom Tab; Android brings Garamaal's own review screen forward when Capture is tapped. Return to the Custom Tab using Android's back or app switching when available.
- **Known prototype limitations:** no confirmed physical phone tests; Custom Tabs bottom toolbar support may vary by browser; login-only ATS pages will not become accessible in the separate WebView. Testing must verify the full callback URL, Android task/back-stack behaviour, hidden WebView rendering and review Save/Make CV handoff. Existing v0.3 PWA deep links now open Secure Browser.
- The live Garamaal web PWA is unchanged by v0.4. The signed production installer and deployment remain separate release gates.



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

## Installed Garamaal PWA → native browser (v0.3.0)

- Keep the existing Garamaal **Install app** option as the website PWA install. Installation from the browser alone cannot silently install an Android APK.
- After installing Garamaal to the Android home screen, the launcher's **Install app** button becomes **Open Browser**. It uses an explicit Chrome Android intent to open the separate Garamaal Browser APK.
- Tapping a job title or external employer vacancy button in the installed Android PWA opens the external HTTPS job in Garamaal Browser. The existing job capture and review controls remain available.
- LinkedIn login, Google OAuth, CV/CL Drive links, desktop web and iOS are deliberately left on their existing routes. Non-installed Android web pages continue opening employer job links normally.
- The native APK registers `garamaal-browser://open?url=<encoded HTTPS job URL>` with a validation gate. It does **not** accept arbitrary schemes, retrieve browser cookies, save jobs without explicit user review or submit application forms.
- If Garamaal Browser is not installed, tapping a job falls back to opening the employer vacancy normally. The **Open Browser** home action falls back to an installation-help page instead.
- **Upgrade to Android Browser v0.3.0 or later**: older v0.2.1 installs do not register the deep link. The live PWA needs the `/prototype/android-browser-launcher.js` change to be deployed before it can open the APK.
- A publicly hosted, stable **release-signed** Android APK/installer has not been configured. The existing GitHub Actions artifact is a short-lived debug build, not a production download/install endpoint.

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
