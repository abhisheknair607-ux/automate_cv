# Garamaal Social-only production release — do NOT redeploy Jobs

## Source and restrictions

- GitHub baseline: \`fix/firebase-garamaal-status-contacts-20261016\`. Social PR #30 adds the isolated service.
- Live Firebase Hosting project: \`abhishek-cv-automation\`, site \`garamaal\`.
- Original Jobs service: \`automate-cv-dashboard\` in \`europe-west1\`. **Never run \`standalone/deploy-live-update.sh\` or \`standalone/deploy.sh\` as part of Social rollout.** Never deploy, update environment variables, or change traffic on \`automate-cv-dashboard\`.
- New service: \`automate-cv-social\`. Its Docker image is built using **only** \`Dockerfile.social\`, \`package.json\`, and four \`standalone/\` Social files; it contains no Jobs HTML, Python worker, Jobs routes or CV runtime.
- \`firebase.json\` preserves the original catch-all rewrite \`** → automate-cv-dashboard\`, exactly and last. Only \`/social\`, \`/social/bridge.js\` and \`/api/social/**\` rewrite to the new service.
- \`/social\` has a separately persisted A/P selection; no Job candidate setting is read/written.

## Deployment authority blocker

Read-only GitHub Actions inspection run 39159203213 confirmed the live root and /health both return 200 and /social returns 404. The authenticated repository Workload Identity service account **cv-automation@abhishek-cv-automation.iam.gserviceaccount.com** was denied **run.services.get**, so it cannot establish the live revision metadata. Do not escalate that worker's IAM by default. Use an **authorised Google Cloud Shell** session (with Cloud Run Viewer/Developer and Firebase Hosting deployment rights) for this one-time Social release, or deliberately provision a separate least-privilege deployment identity.

The public Jobs page byte fingerprint matches \`webapp/Index.html\` blob \`8b9b30be651aa72ef8ca59bada58ef585adfbc79\`, but that cannot prove the exact deployed Git SHA, because multiple commits share this file.

## Phase 1: read-only cloud preflight (Cloud Shell)

\`\`\`bash
PROJECT=abhishek-cv-automation
REGION=europe-west1
JOBS_SERVICE=automate-cv-dashboard
gcloud run services describe "$JOBS_SERVICE" --project="$PROJECT" --region="$REGION" \
  --format='json(metadata.name,status.latestReadyRevisionName,status.traffic,spec.template.metadata.labels)'
\`\`\`

Record the **Jobs latestReadyRevisionName** and all traffic percentages. Check whether a \`git-sha\` provenance label exists. If not, report the revision name without assigning it an unverified Git commit.

## Phase 2: create NEW Social service only

In an authorised Cloud Shell, clone the verified Firebase branch and inspect PR #30. Supply approved values for:

- \`ALLOWED_EMAILS\` — existing authorised Garamaal Google accounts (A/P workspace is selectable by either; no email-to-candidate mapping).
- \`FRESHMAL_SPREADSHEET_ID\` — Freshmaal workbook ID (\`1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc\`).
- \`SOCIAL_INBOX_ABHISHEK_FOLDER_ID\` and \`SOCIAL_INBOX_POOJA_FOLDER_ID\` — **different** private Drive folders, shared with the Social runtime service account.
- \`GOOGLE_CLOUD_PROJECT\` and \`SOCIAL_GIT_SHA\` — same Firebase project and exact checked-out release Git SHA.
- \`SOCIAL_READ_ONLY=true\` and \`SOCIAL_ALLOW_LIVE_WRITES=false\` for initial deployment. After authenticated staging copy checks, both must explicitly be changed to \`false\`/\`true\` to enable actual Social writes; never change \`APP_READ_ONLY\` or other Jobs flags.

The Social runtime identity needs Google Sheets read/write access to the Freshmaal \`Connections\` and \`SocialTracking\` tabs, and Google Drive file access to only the approved private Research Inbox folders. The new service must validate Firebase ID tokens before reading or writing contact data. Configure the runtime identity explicitly; do not rely on an unaudited default account. Cloud Run must be reachable by Firebase Hosting while Social APIs remain protected by Firebase authentication.

Build an **isolated source directory** containing only:
\`Dockerfile.social\` renamed to \`Dockerfile\`, \`package.json\`, \`standalone/social_server.js\`, \`standalone/social_store.js\`, \`standalone/bridge.js\`, and \`standalone/social.html\`. Use \`gcloud run deploy automate-cv-social --source=<isolated-dir> --region=europe-west1 --project=abhishek-cv-automation\` with the approved service account and Social-only environment. Never copy \`webapp/\` into the Social build context.

Confirm \`/health\` identifies \`garamaal-social\`, shows \`readOnly=true\`, and provides the exact \`release\` SHA. Confirm \`/social\` and \`/social/bridge.js\` work and that \`/\`, \`/api/listJobs\`, and \`/api/download\` all return 404 when sent directly to the **Social service**.

## Phase 3: Firebase Hosting only

1. On a Firebase Hosting **preview channel**, deploy the updated \`firebase.json\`. Verify that \`/social\` loads under the preview hostname, \`/api/social/data\` rejects unauthenticated requests (401), and the existing Jobs root still resolves through \`automate-cv-dashboard\`. Preview hostname must be authorised for Firebase Authentication if required.
2. After verification, deploy **Hosting only** for \`garamaal\`. Do not deploy Cloud Run Jobs or Firebase Functions.
3. Re-run the Cloud Shell command in Phase 1; **Jobs latestReadyRevisionName and traffic must exactly match the before snapshot**.
4. Verify the public Jobs HTML SHA-256 remains \`d870c5af112bb1da77426fbb1b5a7c6ec54a81d3f56e7500f7e2c745fd20b054\`; otherwise rollback the Hosting release and investigate before any further changes.
5. Confirm \`https://garamaal.web.app/social\` loads for authorised Google sign-in, with A/P separated. Use staging data for initial read/write tests; do not send real LinkedIn messages automatically or run paid CV generation.

## Rollback

Restore the previous Firebase Hosting release in Firebase Console > Hosting release history if rewrite or auth checks fail. This restores the old all-routes-to-Jobs behaviour **without a Jobs Cloud Run deployment**. Keep the Social service read-only and/or remove its routing. Never rollback by deploying old Jobs source.

## Scope note

This is a release plan, **not evidence that any cloud deployment has happened**. GitHub PR/CI success does not update Firebase Hosting or Cloud Run.
