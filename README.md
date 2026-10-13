# Automate CV — linked PWA v1.1 (13 October 2026)

The app uses the photo/logo supplied by the user. **No manual Apps Script URL entry.**

- PWA URL: https://abhisheknair607-ux.github.io/automate_cv/
- Existing live Google Apps Script web app: https://script.google.com/macros/s/AKfycbw6krfQ8lULe84nUZd88rRnFUffndcUTirt8HQf9TGTDB5B0F6diGn5JA5W5OO5qhix/exec
- The GitHub Pages PWA is the installable entry point; when opened from the installed app drawer it automatically navigates to the Google-hosted dashboard. On ordinary browser visits the prominent Open job dashboard link navigates there.
- **The authenticated dashboard is still hosted on Google Apps Script. It cannot be securely embedded inside GitHub Pages using the current google.script.run backend.** Android may open Chrome when leaving the PWA's origin. The GitHub app does not itself call or store the Google Sheets contents.
- All job changes take effect in the original Google Sheets only when saved in the Google-hosted dashboard, after Google's authentication and server-side validation.
- If the Apps Script deployment is replaced, update the hard-coded LIVE_APP_URL in app.js and the HTML Open job dashboard link. The PWA's installed icon and manifest are unchanged.
- Public pages and icons are safe to cache; user data, OAuth credentials, and Google Apps Script content must NEVER be included in service-worker cache.
- To install: Open the GitHub Pages site in Android Chrome, select Install app, then use the icon in the app drawer. If previously installed, reload or reinstall to ensure the new service worker and app scripts are active.
- This version is *not* a full native-looking embedded dashboard; that requires a different first-party backend or hosted app architecture with proper cross-origin authentication.
