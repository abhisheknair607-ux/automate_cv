# Garamaal Chrome Autofill — Phase 1 prototype

This is a **standalone Manifest V3 Chrome extension**. It is isolated from the
Garamaal production application: no backend routes, Sheets, importer, CV queue,
authentication, production flags or existing UI are changed.

## Install locally

1. Download the files in this \`extension/\` directory into one folder.
2. Open \`chrome://extensions\` and enable **Developer mode**.
3. Select **Load unpacked** and choose that folder containing \`manifest.json\`.
4. Pin **Garamaal Autofill (Prototype)** to the toolbar.

No Chrome Web Store publication, API key or server deployment is needed.

## Try it

1. Sign in to \`https://garamaal.web.app/prototype\`, select **Abhishek** or
   **Pooja**, complete the editable Profile draft and **save** it.
2. With this Garamaal tab active, open the extension, choose the same candidate
   and click **Sync from open Garamaal tab**. The extension reads only
   \`gmv3-career-profile-local-v1:<candidate>\` from Garamaal's own browser
   localStorage, on explicit user request. **This is the editable local draft,
   not the authoritative Drive Evidence Bank or generated CV.**
3. Optionally enter email and phone in the extension (not currently in the
   editable profile draft). Press **Save contact for this session**.
4. Open a recruitment website (try Greenhouse, Lever, Workday or a sample
   HTML form) and click **Detect job**. Check the extracted title/company/JD.
5. Click **Fill blank fields**. Inspect every answer and make any corrections
   manually before advancing or submitting.
6. On the next page/step, reopen the popup and click **Fill blank fields**
   again. Nothing is submitted by the extension.
7. Click **Clear session information** to erase synced profile/contact fields.

## Scope of the prototype

- **Active-tab permission only**: the extension doesn't request access to
  all websites or monitor pages in the background.
- Detects JobPosting JSON-LD and common Workday, Greenhouse, Lever and generic
  heading/description selectors. Not every application page exposes full JD.
- Deterministic autofill supports common fields: full/first/last name, email,
  phone, city, country, university/institution, degree, employer/job title and
  skills when a suitable saved value exists. Select menus require an exact
  option match; custom dropdown widgets are not yet supported.
- Skips prefilled inputs, hidden/disabled fields, file uploads, checkboxes,
  radio buttons, dates, sensitive categories (e.g. visa, disability,
  sponsorship, compensation), and questions without confident mappings.
- Candidate information is stored in **chrome.storage.session**, not permanent
  extension storage, and is kept separate for Abhishek and Pooja. Session
  storage is cleared when the browser session ends; users can clear it earlier.
- No third-party requests, AI model invocation, paid token use or credentials
  are embedded in the extension.

## Out of scope until follow-on integration

- Authenticated server-side Career Intelligence Profile and CV retrieval.
- CV recommendation and uploads (browser security does not allow silently
  choosing local files for file inputs).
- AI-generated answers to unfamiliar questions (must be server-backed,
  authenticated, evidence-checked and user-approved).
- Cross-origin multi-step continuity without reopening the extension.
- Confirmation/recording of an application in Garamaal; never assume an
  application was submitted merely because some fields were filled.
- Automated testing on live ATS websites; their DOM and protections change.

## Developer checks

Run \`node --test extension/test/*.test.js\` from the repository root.
The tests cover field mapping, safety exclusions and candidate isolation.
Manual tests must be completed on live sites with test accounts before a
broader release. Do not use real applications as disposable test submissions.

## Privacy and security notes

This proof of concept deliberately does not attempt to bypass captchas,
login gates, anti-bot challenges or employer restrictions. It never clicks
Submit. Some sites use custom components or shadow DOM, which need separate
adapters. All submitted information remains the applicant's responsibility.
