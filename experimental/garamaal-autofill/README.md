# Garamaal Autofill — review-only Chrome extension prototype

This branch is **development-only** and changes only `experimental/garamaal-autofill/`. It does not modify live Garamaal services, CV workflows, importer, or Freshmaal data.

## Current prototype scope
- Chrome Manifest V3 extension, initiated by the user on the active job-application tab.
- Import a **fictional JSON profile** locally for testing. Real candidate data must not be imported before authenticated storage and security review are in place.
- Fill empty ordinary name, contact and relevant profile text fields.
- Native HTML **select dropdowns** and **radio groups** for narrowly identified employer-relative/family relationship questions: choose **No** by default unless there is an exact employer-specific **Yes** in `declarations.relativesByCompany` and employer identity is available. Never overwrite a selected answer.
- Other sensitive/regulated or unknown questions are skipped rather than guessed.
- **No form submission, no Next/Continue click, no navigation, no persistent page watcher.** The user reviews and advances each application page, and clicks **Fill current page** again on the next page.
- An on-page review record appears in the extension popup after the fields are filled.
- No remote AI, authenticated Garamaal account connection, CV upload, Workday custom-widget automation, or automatic job tracking yet. LinkedIn is excluded from the prototype.

## Local test
1. Checkout branch `feature/garamaal-autofill-review-only-20261114`.
2. In Chrome open `chrome://extensions` → enable Developer mode → **Load unpacked** → choose `experimental/garamaal-autofill/extension/`.
3. In `experimental/garamaal-autofill/` run `python -m http.server 8765`.
4. Open `http://localhost:8765/examples/test-form.html`.
5. In the extension, import `examples/sample-profile.json` (**fictional data only**) and click **Fill current page**.
6. Verify both family-at-employer dropdown and radio buttons select **No**; names/contact fields fill; visa/salary/passport stay unfilled; pre-existing values remain unchanged; no page navigates or submits.
7. Manually move to another application page and click **Fill current page** again.

Automated matcher tests: `node --test tests/matcher.test.js`, run inside `experimental/garamaal-autofill/`.

## Follow-up engineering work
- Authenticated per-user profile source and protected server-side AI endpoint (never bundle AI provider keys into the extension).
- Real-site DOM testing across Greenhouse, Lever, Workday and other application platforms, including React controlled components, iframe limits, custom widgets and step-specific form state.
- Better employer identification and explicit user-managed declarations.
- Job extraction, tailored answer writing, CV selection and application tracking after the autofill baseline passes real-world tests.

**Security:** Chrome extension local storage in this prototype is not an appropriate place for real candidate profiles. No real personal data, identity documents, passwords or API keys should be imported into the MVP.
