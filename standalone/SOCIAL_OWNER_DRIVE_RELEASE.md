# Social Research — delegated owner Drive uploads (Social-only)

## Change scope
Only `standalone/social.html`, `standalone/social_server.js`, `standalone/social_research.js`, Social tests and `standalone/deploy-social-oauth-guarded.sh` are part of the deployment. The Jobs Cloud Run service `automate-cv-dashboard`, `webapp/Index.html`, `standalone/server.js`, Firebase Hosting routing, shared `bridge.js`, and CV automation must not be changed.

## Identity and authorization
- The existing Firebase-authenticated session MUST be `abhisheknair607@gmail.com` to upload a screenshot/TXT/chat source or rename a manually imported source. The web page triggers Google OAuth reauthentication/consent for `https://www.googleapis.com/auth/drive` (full Drive scope), because the two user-owned pre-existing My Drive folders were not created or opened through Drive Picker by this OAuth app. Google's restricted Drive scope may require OAuth app verification or an explicitly allowed test user. Do not bypass Google's consent requirements.
- Only the owner OAuth access token is passed in that specific Social request; the server verifies the Google userinfo email is verified and matches both the Firebase login and the explicit owner email. Never store or log the bearer token, and never add it as a Cloud Run environment variable or share it in ChatGPT.
- Continue to use the existing Cloud Run service identity solely for Sheets and read-only listings. The service account must retain read access to both candidate folders. A/P selection is a workspace selector, **not** an authorization boundary.
- Abhishek source folder: `14VD_l0B_OUKXySY8iFT8YyphVtSDLTlo`.
- Pooja source folder: `1tje5rYUj8aoYLtxCM7VDA9ym0sq5gaSc`.

## File processing contract
1. Upload image/TXT/chat to the correct candidate folder; initial research sources are named `NEW_a_...` or `NEW_p_...` without changing the original file extension. No extraction or contacts import runs automatically.
2. The Research **Copy Prompt** processes only matching `NEW_` source IDs, never `USED_`. Verify persons and roles; append only approved, evidence-backed contacts under the correct candidate to Freshmaal `Connections` and `SocialTracking`, without overwriting jobs or other rows.
3. Read back exact Sheet records. Rename a fully processed file from `NEW_...` to `USED_...` preserving the suffix and extension, through the connected Google Drive account, only after every approved contact is accounted for and read-back succeeds.
4. On partial processing, nonverified names, storage failure, or no permission to rename, leave the source `NEW_`, report the Drive file ID and pending action. On a subsequent run detect existing candidate+company+name records to avoid duplicate imports. Never delete or reupload the input.
5. Chat follow-up drafting remains a separate workflow. No LinkedIn scraping, sending, or automatic paid model calls.

## Release process (manual Cloud Shell; never use a Jobs deploy script)
Prerequisites: confirm OAuth consent allows `abhisheknair607@gmail.com`, Drive API is enabled, and Firebase Auth popup works at the intended domain. Review the exact PR changed-file list and confirm none are Jobs files.

```bash
cd ~
git clone --single-branch --branch fix/social-user-drive-oauth-only-20261020 \
  https://github.com/abhisheknair607-ux/automate_cv.git \
  garamaal-social-owner-oauth
cd ~/garamaal-social-owner-oauth
git status --short
node --check standalone/social_server.js
node --check standalone/social_research.js
npm test
```

First run the guarded Social canary **without promotion**:

```bash
GARAMAAL_SOCIAL_OAUTH_CONFIRM=SOCIAL_ONLY_OWNER_OAUTH \
  bash standalone/deploy-social-oauth-guarded.sh
```

The 0%-traffic preview must show `ISOLATION_OK`, `EDITABLE_CANARY_HEALTH_OK` and `EDITABLE_PREVIEW_VERIFIED`. Check the emitted preview URL, confirm the explicit old Social revision and make sure Jobs traffic was not touched. After consent and authenticated Social-only review, promote using:

```bash
GARAMAAL_SOCIAL_OAUTH_CONFIRM=SOCIAL_ONLY_OWNER_OAUTH \
GARAMAAL_SOCIAL_OAUTH_PROMOTE=YES_AFTER_CANARY_CHECK \
  bash standalone/deploy-social-oauth-guarded.sh
```

That script creates a fresh canary, validates it and then promotes only Social. Record the old Social revision from the script's `ROLLBACK` output. If any step says SAFE STOP, do **not** run a different deploy script or modify Jobs.

## Required acceptance after promotion
- On Chrome/Android, sign in to Social with the owner Google account; verify the Drive permission popup appears and names the correct account.
- As Abhishek upload one disposable JPG/PNG and one TXT; confirm they appear in the Abhishek folder with `NEW_a_`, and not in Pooja's folder.
- As Pooja upload a separate disposable TXT; confirm `NEW_p_` only in Pooja's folder.
- Save and read back a test follow-up chat, and import one verified disposable contact in Social; check the corresponding Sheets row, then its source file's `USED_` rename.
- Verify `https://garamaal.web.app/` still has the same Jobs UI, counts and CV-ready links as before. Never generate CVs to test.
- Remove only disposable test artifacts after recording verified results, subject to the owner's approval.

**Limitations:** Automated checks and an unauthenticated health response cannot prove Google's actual OAuth popup or personal Drive write succeeds. This requires an owner-signed-in browser test; do not claim it is verified beforehand.
