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
