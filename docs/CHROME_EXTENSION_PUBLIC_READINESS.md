# Chrome extension public-release preparation

**Build:** `chrome-extension/` v0.11.6 Beta (26 files). Local package has 239 passing Node tests.
**Status:** PRE-PUBLIC BETA. Not deployed or published on the Chrome Web Store.

## Implemented in this branch
- Captured jobs remain connected to the same Make CV/autofill flow. The code comes from the preserved v0.11.5 Drive build, with test-only/install-time domain permissions removed in v0.11.6.
- `webapp/Code.gs` and `garamaal-release-webapp/Code.gs`: safer row allocation using all actual sheet data fields, preserving existing statuses, preferences, CV links and scores. Only known Freshmaal FALSE template defaults are ignored.
- Under-lock live URL dedup in Taaza and Freshmaal instead of stale cached projections.
- Correct Taaza N/O and Freshmaal AT/AU preference values in the legacy writer.
- Back-end `/config` exposes a strictly gated Chrome Web Store listing from `CHROME_WEB_STORE_EXTENSION_ID` (32 characters a–p) and `GARAMAAL_EXTENSION_PUBLIC_ENABLED=true`.
- One compact **Extension soon / Get extension** button appears on Garamaal root, legacy and prototype routes. It links to the Chrome Web Store only after enabled.
- `standalone/test/capture_row_safety.test.js` covers occupied rows, template defaults, safe append, bounds and dedup presence.

## Public release blockers
1. **Multi-tenant identity:** Existing backend access is allowlisted for two candidates. A Chrome Web Store install is not a user onboarding service. Build user-specific Firestore/Cloud Storage access, CV execution, statuses and authorization.
2. **Staged Sheets validation:** Run new row allocator and duplicate retry tests on **copies** of Taaza and Freshmaal. Protect pre-existing scores, ranks, formulas, preferences and generated documents.
3. **Live employer ATS evidence:** Test 10 representative application flows and verify minimum 8/10 applications with ≥80% correct retained fields.
4. **Chrome Web Store developer account:** Register, pay the one-time fee, provide public accurate privacy policy, data-use disclosures, screenshots, listing details and test credentials, then submit for review.
5. **Deployment:** This branch is not production. After review, deploy with the feature flag OFF. Enable the Store button only after approval and tenant isolation. Verify page installation, origin permission prompts, and user-account boundary.
6. **Connected AI service:** Review the newer AI/policy patch and the deployment environment; the extension being versioned does not automatically deploy it.

Do not manually sideload a ZIP to end users as an alternative to Chrome Web Store installation. Never add automatic Next, Continue or Submit actions.
