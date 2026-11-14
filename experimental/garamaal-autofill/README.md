# Garamaal Autofill - development extension

Garamaal fills the current job application page only. The side panel lists each successful question and answer, with a Show button to locate the field. The user can click Next page in the panel after review; it only acts when there is one clear Next or Continue control. It never clicks Submit automatically.

## What works today

- **Inspect page** reads the live DOM without filling. It reports native fields, custom dropdowns, checkboxes and file uploads.
- **Fill current page** lists each successful question and answer in the side panel. Show highlights its field on the application. **Next page** is a separate user click and leaves ambiguous navigation or Submit to the candidate.
- The scanner reads labels, ARIA names, autocomplete hints, nearby section text, option labels and values, and job metadata.
- The fictional local profile fills known text, native select, radio, date and split birth-date controls. Existing answers and disabled options remain untouched.
- An optional local AI service answers unfamiliar questions from selected fictional profile facts. Uncertain or protected questions remain blank.
- A **Signed-in Garamaal Drive evidence** source is prepared. It calls a feature-gated authenticated Cloud Run route through an open Garamaal tab. The deployed service is not enabled yet.

## Local test

1. Load `extension/` unpacked at `chrome://extensions`.
2. In this directory run `python -m http.server 8765`.
3. Open `http://127.0.0.1:8765/examples/controls-test.html`.
4. Choose the fictional local source, import `examples/sample-profile.json`, and click **Inspect page** or **Fill current page**. Review the question and answer list in the side panel, use **Show** to locate a field, and use **Next page** only after review.
5. Run `node --test tests/matcher.test.js` and `node --test ../../standalone/test/autofill.test.js`.

The fictional profile is stored in Chrome local extension storage. Do not import real personal data into this development profile.

Garamaal Career Profile now includes the Jobright-style Personal, Education, Work Experience, Skills and Equal Employment sections while retaining the existing career sections. The editor starts those fields empty and preserves older local drafts. Equal Employment answers, the address and visa preference remain browser-local and are excluded from connected autofill requests; email, phone and LinkedIn can be used as candidate evidence when the user selects connected autofill.

When updating the unpacked extension, click **Reload** at `chrome://extensions`. The toolbar icon now opens a persistent Chrome side panel. The BlackRock and Spot.io sample sites have scoped access. For other newly opened job sites, click the Garamaal toolbar icon on that tab to give temporary access. A required native dropdown with exactly one enabled real choice is filled automatically; dependent dropdowns are rescanned after each choice. Connected mode may ask Chrome for access to `garamaal.web.app`; allow it, and keep a signed-in Garamaal tab open. If access is still blocked, check the extension Details > Site access setting. Fictional mode inserts sample facts, so clear them before using a real application form.

## Connected source release gate

The server route in `standalone/server.js` is disabled unless `AUTOFILL_ENABLED=true`. It verifies the existing Firebase ID token, maps the authenticated email to exactly one candidate using `AUTOFILL_CANDIDATE_EMAILS`, reads that candidate's Summary Doc and Master Evidence Bank through the Cloud Run service account, and validates answer evidence and exact option values. The extension does not store an AI key or Firebase token.

For each page, the server checks all eligible fields against the saved Career Profile first. It sends only unanswered fields to the Summary Doc, then only remaining fields to the Master Evidence Bank. It stops reading documents as soon as the page is answered. The current Career Profile is a browser-local draft; when empty, the Summary Doc is the first usable source.

Before enabling the route, confirm the configured Drive IDs point to readable Google Docs or DOCX files, set the email-to-candidate map and model, test a tagged staging revision with fictional data, and verify an actual application page without submission. No production deployment or main-branch merge is part of this branch.

Custom menus, checkboxes, file uploads, complex employment sections, and proven Workday/Greenhouse/Lever compatibility remain outstanding.
