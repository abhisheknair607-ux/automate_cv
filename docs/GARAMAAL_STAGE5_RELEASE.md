# Garamaal Stage 5 — controlled canary and release gate

## Current verified state (26 October 2026)
- Stage 4 integrated as GitHub PR #72, squash merge `b1fe5fa01da67c3ad197769a6608ed9a204c47b2`.
- Stage 4 GitHub Python, Node, UI and CV worker-protection QA passed before merge.
- `main` contains the new code. **There has been no Cloud Run/Firebase deployment and no change to live website traffic as part of this release preparation.**
- Read-only Taaza scan observed 694 populated master jobs and 11 exact duplicate groups; all 14 candidate extra rows require protected review rather than physical deletion.
- Shared Gmail OAuth, real-mail read-only preview, parser approval, and enabling importer/status writes remain separate follow-on actions.

## Stage 5 canary release candidate

Only new release preparation is on `release/taaza-stage5-canary-20261026`; the CV worker, existing production UI, Freshmaal, Firebase and Sheets data are unchanged.

The safe deployment source is **`Dockerfile.garamaal-ui`** plus `garamaal-release-webapp/` and `standalone/`. Do not run the older `standalone/deploy-live-update.sh` for this release: it refers to the wrong image layout.

`standalone/deploy-stage5-canary.sh` is inspection-only by default:

```sh
bash standalone/deploy-stage5-canary.sh --plan
```

A separate explicit canary-deploy approval is required before running:

```sh
bash standalone/deploy-stage5-canary.sh --deploy-canary
```

That command needs an authorized `gcloud` session with Cloud Run source deployment privileges. The script checks production service identity, sheet IDs, existing CV dispatch/write flags, and disabled new alert/duplicate-write flags. It builds only the intended UI image and uses `--no-traffic --tag stage5qa`. It refuses a rollout if live traffic changed and checks `/health` on the tagged URL. Cloud Run metadata and secrets are not bundled into Cloud Build sources.

**Never promote `stage5qa` to live traffic from this script.** Baseline production traffic stays assigned to the existing revision(s); the tagged URL is exclusively for validation.

## Signed-in canary acceptance before a later traffic promotion

1. Record existing Cloud Run revision, traffic percentages, Firebase Hosting rewrite, service account and readiness state.
2. Confirm `/health` is healthy on the tag and **0%** of normal traffic serves the canary.
3. Test both candidates independently and preserve per-candidate Discovery and Make CV data.
4. Verify Master Controls placement, import popup layout and last-run status; importer apply must remain disabled.
5. Run the existing read-only Python duplicate check separately if dispatch authorization is available, confirming it does not edit any Sheet.
6. Verify `Dup` button is present in Discovery and gated unless explicitly activated; never remove historic job data.
7. Check dashboard, filters, swipe, Social, rankings, CV runs/status and existing scheduled Taaza sync remain functional.
8. Keep a recorded rollback plan: Cloud Run supports routing 100% to the previous revision, with no need to replace Firebase Hosting.

## Separate approval boundaries

- **Approved:** Stage 4 merge into GitHub main; Stage 5 preparation, static tests, draft PR.
- **Not approved/executed:** Cloud Run canary deployment; promotion to live web traffic; Gmail OAuth activation; importing emails to Sheets; automatic duplicate-status writes; deleting historical rows.
- Any production traffic migration must be separately approved after signed-in canary checks, and should use Cloud Run controlled traffic routing rather than a blind source deploy.

See GitHub PR #72 and the Stage 5 release-preparation PR for evidence and tests.


## Canary attempt: GitHub identity lacks Cloud Run permission (26 October 2026)

The one-time, approval-marked GitHub run [40295548369](https://github.com/abhisheknair607-ux/automate_cv/actions/runs/40295548369) authenticated correctly through WIF, but its existing shared CV worker service account `cv-automation@abhishek-cv-automation.iam.gserviceaccount.com` was denied `run.services.get` on `automate-cv-dashboard`. The release exited at `gcloud run services describe` **before creating any revision or changing traffic**. This is an IAM blocker, not a test failure or deployed release.

**Do not give Cloud Run deployment privileges to the shared CV-worker account.** The GitHub canary workflow now explicitly requires a separate repository variable `STAGE5_CLOUD_RUN_DEPLOYER_SERVICE_ACCOUNT`, wired to a dedicated short-lived WIF deployment identity. That identity should have only Google-documented Cloud Run source-deploy roles and `iam.serviceAccountUser` on the existing Cloud Run service identity. Required role reference: https://docs.cloud.google.com/run/docs/deploying-source-code

### Lowest-involvement recovery: authorized Cloud Shell one-time canary

A Google Cloud project administrator who already has Cloud Run deployment permission may avoid changing any GitHub/CV-worker IAM by running the already-tested repository script directly in Cloud Shell:

```sh
git clone --branch release/taaza-stage5-canary-20261026 https://github.com/abhisheknair607-ux/automate_cv.git /tmp/garamaal-stage5
bash /tmp/garamaal-stage5/standalone/deploy-stage5-canary.sh --plan
bash /tmp/garamaal-stage5/standalone/deploy-stage5-canary.sh --deploy-canary
```

This builds the approved paired UI image and tests the `stage5qa` tag at **0%** normal traffic; it does not promote the revision or enable Gmail/Q writes. Read the inspection output first; if any account or production invariant differs, the script exits without deployment.

Alternatively, set up a **dedicated** deployment service account and grant repo-scoped WIF impersonation plus Google's minimum source deployment roles, then set the repository Actions variable `STAGE5_CLOUD_RUN_DEPLOYER_SERVICE_ACCOUNT`. A fresh explicit deployment trigger would still be required.

### Status

- Existing `main` Stage 4 code remains merged.
- Stage 5 PR #73 remains draft; canary deployment not verified.
- Full tests, canary preflight and CV-worker protection passed.
- No production promotion, Gmail import writes, Q status changes or historical row deletion.

## Successful authorized Cloud Shell canary (26 October 2026)

The user ran the Stage 5 release script from an authorized Cloud Shell session in Google Cloud project `abhishek-cv-automation`:

- `--plan` verified the existing service account, candidate/CV controls, production Sheet IDs, and disabled new import/status-write gates.
- The production revision before deployment was `automate-cv-dashboard-00032-hol` at **100%** traffic.
- `--deploy-canary` built and created revision **`automate-cv-dashboard-00035-lig`**.
- The tagged URL is **https://stage5qa---automate-cv-dashboard-vv25bizjcq-ew.a.run.app**.
- The script verified **0% live traffic** for the new revision, unchanged baseline traffic, and a successful `/health` check.
- Cloud Build ID: `564e1eaf-71d6-44bb-910c-1d2e5d9717d2` in `europe-west1`.

**Scope of verification:** deployment, zero-traffic isolation and the unauthenticated health endpoint passed, as reported by the Cloud Shell output. Authenticated application feature parity, both candidates, Master Controls UI, and actual clickable Discovery filters have **not** yet been independently verified. External assistant web access to the tagged URL was unavailable; no browser/signed-in functional pass is claimed.

### Next gate: signed-in QA before promotion

On the tagged URL, verify Jobs Dashboard, Discovery (including `Dup` filters and action), Master Controls > Import Alerts (Preview and Apply safely disabled unless separately enabled), Swipe, Make CV and both candidates. The existing Social service/Firebase route must be independently checked on the current live website for unchanged behavior. Do not click a CV dispatch or any write action solely for QA. After screenshots/results, only a separate explicit user decision can authorize production traffic changes. Keep Gmail import, automatic Q status updates and historical cleanup locked.
