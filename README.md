# Automate CV — Installable PWA launcher

**Name shown in app drawer:** Automate CV. **Icon:** user-selected Automate CV document/up-arrow logo; PNG versions at 192px, 512px, 512px maskable, plus Apple icon.

**Publishing address (after enabling GitHub Pages):**
https://abhisheknair607-ux.github.io/automate_cv/

## Architecture: preserve the existing Google Sheet integration

The PWA is a lightweight, installable **launcher** for the real Google Apps Script web application; it is **not** a replacement for the Apps Script user-authenticated app or the GitHub CV worker.

1. Install this HTTPS-served launcher using Chrome on Android. The manifest registers it as a standalone app called **Automate CV** in your app drawer.
2. Once, paste the `/exec` web app URL from **Apps Script → Deploy → Manage deployments** into the PWA's settings and click Save. This saves only the deployment URL to this device's localStorage.
3. Tap **Open Automate CV**. The current Apps Script web app opens in Chrome, where its existing Google sign-in and Google Sheets permissions work normally.
4. In that live Apps Script application, successful edits to Taaza/Freshmaal are immediately written to the original Sheets. The PWA itself never reads or writes spreadsheets and does not claim that opening the local demo saves data.

**Why launcher instead of embedding?** Google Apps Script's user-authenticated `/exec` site has a different origin, and framing it can be blocked by Google's framing protections, session cookies or login flows. We intentionally do **not** weaken clickjacking protection with `XFrameOptionsMode.ALLOWALL` or add a public backend that could bypass your Google account allowlist. Therefore the job-control screen may open outside the PWA window. A completely in-app frontend would require a separately secured authentication and Google Sheets backend, not a manifest-only modification.

## Publishing

The code is on the dedicated `gh-pages` branch of `abhisheknair607-ux/automate_cv`, with its public files in branch root. To publish **without altering the CV automation on main**:

1. Open https://github.com/abhisheknair607-ux/automate_cv/settings/pages
2. Under Build and deployment select **Deploy from a branch**.
3. Branch: **gh-pages**; Folder: **/(root)**; click **Save**.
4. Wait for GitHub Pages deployment to succeed, then open https://abhisheknair607-ux.github.io/automate_cv/ in Chrome on Android.
5. Choose **Install app** (or Chrome **⋮ → Add to Home screen → Install app**).
6. If the page reports Setup, paste your real Apps Script `/exec` URL; this stays private on that phone.

If GitHub Pages is already enabled using a different source, **do not change the source blindly**; review which content is currently published first. In that case, deploy this branch's files to the existing static host or configure a separate repo.

## Shorter custom web address

The GitHub Pages address above is **shorter than the Apps Script deployment URL and contains `automate_cv`**, but is not a fully custom domain. An even shorter domain (e.g. `automatecv.app`) requires registering a domain and DNS/hosting configuration. We have **not** purchased, registered or claimed such a domain. Never hardcode sensitive credentials into the PWA's public GitHub files.

## Offline, security, and updates

The service worker caches only static public launcher assets. It does **not** cache private job data, intercept requests to Google, work around Google sign-in, or queue failed edits. The live Apps Script site and CV worker still require connectivity and proper Google authorisation. App installability needs HTTPS (GitHub Pages provides it), valid manifest and user browser support.

### Testing before release

- Check `manifest.webmanifest` parses and names Automate CV.
- Verify icons have 192px, 512px and maskable 512px sizes.
- Visit hosted HTTPS URL, inspect Chrome DevTools → Application → Manifest/Service workers.
- On Android Chrome, install app and confirm app drawer icon/name.
- Paste `/exec` link, close/relaunch the PWA; verify link persists, open working app, edit an unimportant Taaza job and confirm Sheet cell changed. Confirm installed PWA does not misrepresent its local preview as live.
- Verify Pooja's phone config separately using her Google sign-in.
