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

The workflow runs on every push to this branch and:
1. Checks native app/route/asset contracts without external calls.
2. If `GARAMAAL_PREVIEW_GCP_SA` Actions secret is missing, finishes without deploying. It reports this prerequisite in GitHub Actions Job Summary.
3. If the secret is set, authenticates Google Cloud, builds separate **preview** images, deploys them read-only to two NEW Cloud Run services and publishes a 7-day Firebase Hosting preview channel.
4. Prints the actual browser test URL in the workflow Job Summary. Visit `<printed-preview-URL>/prototype` for the connected front end.

Required one-time user action: create a narrowly scoped Google Cloud preview deployment service account with permission to build images, deploy NEW preview Cloud Run services, act as the approved runtime service accounts, and deploy Firebase preview channels; upload its JSON as repository Actions secret `GARAMAAL_PREVIEW_GCP_SA`. Optionally set `GARAMAAL_PREVIEW_ALLOWED_EMAILS` if the current Jobs service does not expose `ALLOWED_EMAILS` as a non-secret environment value. Do NOT put the JSON into the repository or chat.

If preview sign-in rejects a valid account, Firebase Authentication may need the generated preview hostname added to its authorized domains (Google Authentication settings).

## Regression / rollout
Run `node --test standalone/mobile_home_shell.test.js standalone/mobile_hubs.test.js standalone/test/collage_frontend.test.js` and `npm test`. Check Jobs /, Social /social unflagged parity, candidate switching, image and MP4 routes, and read-only write guards. Before any eventual merge, test authenticated preview from Android and desktop, sheet reads and candidate separation. No automatic deployment to production or merge is configured.

Known gaps: database-backed profile editor, persisted user-specific goals, Jobs Swipe interests and actual staging write testing need separately scoped data/security design. The UI does not pretend those exist.
