# Garamaal Autofill MVP — development-only branch

This isolated prototype adds **experimental/garamaal-autofill/** and does not modify Garamaal production services, existing CV workflows, importer, or Freshmaal.

## Scope
- Chrome MV3 extension; user-triggered current-tab scan with \`activeTab\` permission.
- Import a **synthetic** profile JSON locally; propose safe field matches for review.
- Fill checked, currently empty text fields with event dispatch. Never submit.
- Exclude LinkedIn and sensitive/regulated fields.
- No remote AI, server-side authentication, CV upload, Workday custom widgets, radio/select controls, or auto-navigation in this branch.

## Test
1. Chrome \`chrome://extensions\` → Developer mode → Load unpacked → select \`experimental/garamaal-autofill/extension\`.
2. Start a local server in this directory: \`python -m http.server 8765\`.
3. Open \`http://localhost:8765/examples/test-form.html\`.
4. Click the extension and import \`examples/sample-profile.json\`.
5. Click Scan, review the proposed fields, and Fill checked.
6. Confirm salary and passport inputs remain blank and pre-existing entries remain unchanged.

Tests: \`node --test tests/matcher.test.js\`.

**Security:** This build stores profiles unencrypted in Chrome storage and is for fictional test data only. Do not use real candidate CVs here before implementing authenticated per-user storage. Never place provider keys in extension code. The separate downloadable prototype also includes a local optional Gemini CV extractor; integrate it as a protected backend only after a privacy and authentication review.
