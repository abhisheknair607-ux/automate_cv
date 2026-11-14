# Garamaal Autofill - development prototype

This isolated Manifest V3 extension fills the current job application page only. It never clicks Next, Continue or Submit. The candidate reviews every page and manually advances before running autofill again.

## Implemented

- The popup scans visible native text inputs, textareas, selects and radio groups after a user click. It extracts accessibility labels, autocomplete hints, nearby context, option text, and basic job metadata. Inspect page reports detected controls without filling anything.
- Known contact and profile fields use deterministic matching, including exact native select and radio option matching. An explicit ISO birth date can fill a native date input or split day/month/year controls.
- Unfamiliar eligible questions can use the local AI service. The extension supplies up to 12 relevant work, education, certification, project and skill facts per question, without sending the profile's contact details.
- AI answers must identify supplied evidence. Select and radio answers must match an actual option value. Empty or previously answered controls are preserved.
- Consequential questions and declarations remain for manual completion. Unclear free-text birth-date formats, checkboxes, file uploads and custom widgets are not supported yet.
- The hard-coded employer-relative rule and its company-specific configuration have been removed. Missing information never defaults to No.

## Local development

1. Load `extension/` unpacked in Chrome.
2. Open `examples/test-form.html` from a local server, such as `python -m http.server 8765` in this directory.
3. Import `examples/sample-profile.json` and click **Fill current page**.
4. For AI answers, start the development service with `GARAMAAL_AI_MODEL`, `OPENAI_API_KEY` and `GARAMAAL_EXTENSION_ID` set, then run `node server/ai.js`. The extension ID appears at `chrome://extensions`. The server binds only to 127.0.0.1:8766 and accepts requests from that extension origin.
5. For control-only testing, open `examples/controls-test.html`, reload the extension at `chrome://extensions`, and re-import the updated fictional profile. The control test does not need the AI service. Check that native country/university selects, country radio, native date and split birth-date controls fill; the prefilled country, disabled choice, terms checkbox, custom menu, Continue and Submit remain untouched. The page logs input/change events and protected actions.
6. Run `node --test tests/matcher.test.js`.

Do not import real candidate data into this prototype. The sample profile is stored in Chrome local extension storage. The local AI service is a development bridge, not a production authentication or per-user profile solution.

## Architecture and next work

The page scanner and writer run only through `chrome.scripting.executeScript` on the active tab after a click. `matcher.js` fills known facts; `reasoner.js` ranks candidate evidence and validates AI results; `server/ai.js` calls the AI provider with a server-side key. The popup never holds a provider key.

For production, integrate an authenticated, per-user profile source and AI endpoint with Garamaal's existing Firebase-authenticated Cloud Run service. Fetch a selected CV and evidence bank server-side, enforce user ownership, add rate limits and audit metadata, and return field-scoped answers. Avoid storing profiles in extension storage. Expand DOM adapters for Workday, Greenhouse, Lever and custom React controls, then test them using fictional accounts and forms. The current prototype has no authenticated Garamaal integration, live ATS compatibility evidence, checkbox/section filling, or application tracking.
