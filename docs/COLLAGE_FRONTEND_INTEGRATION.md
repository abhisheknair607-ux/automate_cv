# Garamaal collage integrated preview — developer handoff

Branch: `prototype/collage-frontend-integration-20261025`
Base: `prototype/mobile-v3-feature-parity-20261025`
Scope: opt-in preview only, NOT merged and NOT production-deployed.

## What ships
- Original approved high-contrast ripped-paper collage images: homepage, navigation default/hover/selected, back/avatar control sprites.
- Original 5-second mobile and desktop MP4s as source assets. The prototype intentionally stops the film at ~3.77 seconds, before its outdated baked-in mockup, and crossfades to the ACTUAL live app DOM. The intro can be replayed and skipped; initial autoplay is muted as required by browsers.
- Responsive two-column desktop launcher and four action cards on mobile.
- Complete existing backend-backed Jobs and Social HTML, scripts and native event handlers are preserved. No substitution with the offline QA app.

## Frontend triggers and backend mapping
| UI control | Existing function or route | Data behavior |
|---|---|---|
| Home → Apply jobs | `enterJobs()` → original `nav("dashboard")` | Original Jobs API/Sheets reads |
| Home → Statistics / My stats | `enterJobs()` → original Dashboard | Original authenticated Jobs stats; no local fake metrics |
| Home → Network | `/social?gmv3=1` | Original Social app with Firebase auth and /api/social endpoints |
| Home → Update profile | `showPanel("profile")` | **Not persisted**: structured profile database/editor remains future scope |
| Home → Targets / Reminders | Existing `showPanel` local controls | Session-only demo, explicitly labelled, no backend writes |
| Jobs → Dashboard | Original `nav("dashboard")` | Existing live bridge |
| Jobs → Discovery | Original `nav("discovery")` | Existing live bridge, native filters |
| Jobs → Make CV | Original `nav("fresh")` | Original native CV controls, subject to existing backend write permission |
| Jobs → Swipe | Stage 2 read-only fictional example | No job status / interest write. Stage 3 needs user-owned data contract. |
| Jobs → More | Original Add Job, original ranking + links | Existing native handlers |
| Social → Targets | Original `data-view="dashboard"` click | Existing Social data |
| Social → Research | Original `data-view="inbox"` click | Original research loader/API |
| Social → Swipe | Original `data-view="swipe"` click | Original Social handler (write operations blocked in read-only stage) |
| Social → Follow-ups | Original `data-view="followups"` click | Original Social handler |
| Social → Stats | Native `stats()` from authorised loaded session | Read only |

## Backend / storage guarantees
- `webapp/Index.html` and `standalone/social.html` stay byte-identical to Stage 2 reference.
- /prototype is the only Jobs route that receives collage HTML/CSS/JS. Unflagged / and /social retain original responses.
- Original Firebase token validation, account allowlist, candidate chooser, data routing, spreadsheet access controls and CV handlers remain unchanged.
- The staging workflow uses a preview Firebase Hosting channel with rewrites to `garamaal-collage-jobs-preview` and `garamaal-collage-social-preview`, NEVER to the two production Cloud Run service names.
- Both staging Cloud Run instances are deployed with `APP_READ_ONLY=true` or `SOCIAL_READ_ONLY=true`, live-write switches disabled, zero minimum instances and max one instance.
- Staging data can be read from the originally authorised Sheets, but staging write requests must fail. No OpenAI generation tests.

## Automatic staging preview (one-time setup)
GitHub workflow: `.github/workflows/collage-preview.yml`
Action URL: https://github.com/abhisheknair607-ux/automate_cv/actions/workflows/collage-preview.yml

The 25 October deployment attempt proved existing Workload Identity authentication works but the CV automation runner `cv-automation@abhishek-cv-automation.iam.gserviceaccount.com` does NOT have `run.services.get`. **Do not elevate that worker identity or change production Cloud Run services.** The preview workflow now requires a separate deployer account.

**Prerequisite:** In Google Cloud IAM, create a purpose-specific `garamaal-preview-deployer` service account. Grant only project-specific deploy rights needed to inspect existing services and create the two isolated preview Cloud Run services, upload images and deploy a Firebase Hosting preview channel. Typical permissions/roles to configure according to organisation policy: Cloud Run Admin (includes read), Artifact Registry Writer scoped to the image repository, Firebase Hosting Admin, Service Usage Consumer if needed. Grant Service Account User **on the Jobs and Social runtime service accounts only**, not broadly on every service account. Ensure the GitHub Workload Identity principal for this repository **and preview branch** is trusted to impersonate this new deployer using `roles/iam.workloadIdentityUser`. Prefer branch-scoped WIF conditions.

In GitHub repository Settings → Secrets and variables → Actions → Variables, set `GARAMAAL_PREVIEW_DEPLOY_SA` to the new deployer's **email**. The existing `GCP_WORKLOAD_IDENTITY_PROVIDER` variable is reused. No JSON service-account key or credential upload is needed. If needed for staging reviewers, add optional secret `GARAMAAL_PREVIEW_ALLOWED_EMAILS`; otherwise the workflow reads the approved emails from the existing Jobs service configuration.

On the next push to this branch or a manual workflow dispatch, GitHub Actions runs tests, authenticates with dedicated WIF, builds two preview images and deploys two **new** Cloud Run services in `europe-west1`: `garamaal-collage-jobs-preview` and `garamaal-collage-social-preview`. It then deploys **Firebase Hosting preview channel only**, seven-day expiry. The URL appears in its GitHub Actions job summary, with `/prototype` appended for the integrated UI. It does not deploy to `garamaal.web.app` live. The services use `APP_READ_ONLY=true` and `SOCIAL_READ_ONLY=true` and production-write gates false.

**Status:** Code is pushed; latest code tests passed. No Cloud Run preview services or Firebase test URL were created by the blocked attempt. The earlier runner lacked Cloud Run permissions. Actual signed-in testing still pending.

If preview sign-in rejects an approved account, Firebase Authentication may need the generated preview hostname added to Authorized Domains. The preview deployment should not bypass authentication.

## Regression / rollout
Run `node --test standalone/mobile_home_shell.test.js standalone/mobile_hubs.test.js standalone/test/collage_frontend.test.js` and `npm test`. Check Jobs /, Social /social unflagged parity, candidate switching, image and MP4 routes, and read-only write guards. Before any eventual merge, test authenticated preview from Android and desktop, sheet reads and candidate separation. No automatic deployment to production or merge is configured.

Known gaps: database-backed profile editor, persisted user-specific goals, Jobs Swipe interests and actual staging write testing need separately scoped data/security design. The UI does not pretend those exist.
