# Garam Mal — Architecture & Maintenance Reference

**Snapshot:** 2026-10-17 · **Repository:** [automate_cv](https://github.com/abhisheknair607-ux/automate_cv) · **Code baseline:** `main` at `8f835024bd0039e5641625f4b0140c502740ac40`.

This is a **read-only inspection reference**, not a production deployment certificate. Distinguish verified repository/Drive contents from deployment claims in historical docs. Existing [architecture decisions](ARCHITECTURE_DECISIONS.md) remain authoritative for CV quality and candidate isolation.

## 1. System map

```text
Taaza Videsi Maal (Discovery, Jobs and regional tabs)
    |       20-min scheduled region-to-master sync (no CV generation)
    v
Fresh Maal (Sheets; per-candidate controls, status, links, cost, Connections)
    |                         ^
    | eligible row             | candidate-scoped updates + role-folder links
    v                         |
GitHub Actions (scheduled worker / controlled dispatch)
    |
Python src/automate_cv (profiles, Drive source loading, OpenAI stages,
  deterministic DOCX and factual QA, bounded retries and checkpoints)
    |
Google Drive candidate-specific sources and Outputs/
    Abhishek/Company/Role/ ...  |  Pooja/Company/Role/ ...

UI alternatives sharing Sheets:
  A. main: webapp/Code.gs + webapp/Index.html (Google Apps Script)
  B. unmerged migration/feature/fix branches:
     Firebase Hosting/Auth -> Cloud Run Node standalone/server.js
     -> runtime/bridge/sheets compatibility -> same webapp + Google Sheets
```

### Verified connected data
- [Fresh Maal](https://docs.google.com/spreadsheets/d/1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc/edit): `Sheet1`, `Selected Jobs`, `Pooja CV Writing Prompt`, `Connections` (observed 2026-10-17).
- [Taaza Videsi Maal](https://docs.google.com/spreadsheets/d/1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY/edit): `Jobs`, `TP Europe`, `Pooja Europe` (observed 2026-10-17).
- Saved Drive backups and an October 14 staging copy exist; **do not treat these as the active production controller**.

## 2. Main workflows (GitHub `main`)

| Workflow | Trigger, code path | Purpose and protections |
|---|---|---|
| `hourly-cv-worker` | `.github/workflows/hourly-worker.yml`; cron **07, 27, 47** each hour, dispatch, targeted config push; `python -m automate_cv.runner` | Requires `AUTOMATION_ENABLED=true`; concurrency serialisation, per-row eligibility, bounded batch (default 5), retries/locks/cost ceiling |
| `controlled-cv-test` | Manual `workflow_dispatch` row + candidate + optional Web selection; `automate_cv.controlled` | Explicit **paid** single-row generation; shares worker concurrency group |
| `taaza-regional-master-sync` | `taaza-master-sync.yml`; cron **13, 33, 53** each hour + manual/config push; `src.automate_cv.taaza_sync` | Independently mirrors specialist tabs into `Jobs`; no CV-generation step |
| `tests` | pushes and PRs; `PYTHONPATH=src pytest -q` | Python regression suite |
| `connectivity-test`, `verify-drive-oauth` | Manual; OAuth verification also on targeted push | Read-only connectivity/token/source folder checks, no CV generation |

**Observed runs:** the 2026-10-17 scheduled CV-worker run [39057997123](https://github.com/abhisheknair607-ux/automate_cv/actions/runs/39057997123) and Taaza sync run [39056589891](https://github.com/abhisheknair607-ux/automate_cv/actions/runs/39056589891) completed with success. The Oct 16 [Python tests run](https://github.com/abhisheknair607-ux/automate_cv/actions/runs/38898758480) passed. This does **not** independently verify each queued CV, actual outputs or Firebase/Cloud Run health.

## 3. Backend / frontend / hosting

- Python backend: `src/automate_cv/{runner,controlled,workflow,freshmal,drive,profiles,google_auth,openai_client,qa,connections,taaza_sync}.py` and related helpers. Dependency management in `requirements.txt`; `Dockerfile` is the **Python** worker image.
- Original mobile-responsive UI: `webapp/Index.html` (plain HTML/CSS/JS) with `webapp/Code.gs` server-side Apps Script; `webapp/tests/not_interested.test.js`.
- Alternate dashboard (not in `main`): `standalone/` Node compatibility runtime, Firebase Authentication, Cloud Run server, Sheets adapters, authenticated dispatch and scoped download/contact handlers, PWA/assets and `standalone/test/`; `Dockerfile.standalone` and `firebase.json`. Hosting documented as `https://garamaal.web.app` -> `automate-cv-dashboard` Cloud Run (`europe-west1`).
- **Deployment truth is unverified:** [PR #15](https://github.com/abhisheknair607-ux/automate_cv/pull/15) remains open; historical `standalone/README.md` has both pre-launch and later live-service instructions. [PR #24](https://github.com/abhisheknair607-ux/automate_cv/pull/24) is an open fix based on a feature branch. No Cloud Run active revision or Firebase Hosting release was read; never infer the active code from `main` or an open PR.
- Cloud Run release instructions explicitly require an operator-run `standalone/deploy-live-update.sh`; a GitHub merge **alone does not deploy**. Preserve the existing Firebase auth, Cloud Run service and Apps Script fallback until live cutover history is verified.

## 4. Candidate separation and flow

| Control / state | Pooja | Abhishek |
|---|---|---|
| CV, CL, Web Search | Fresh Maal `E:G` | `H:J` |
| Workflow status | `K` | `L` |
| Private row/checkpoint fields | `W:AF` | `M:V` |
| Output folder link | `AJ` | `AK` |
| CV model preset | `AS` | `AR` |
| Application progress (new dashboard) | `BF` | `BE` |

Both share job inputs `A:D`; `AG` optional location. Contacts saved to `Connections!A:L` include candidate, Freshmaal row, vacancy link and verification evidence, which must all match when reading or writing a contact. Candidate profiles load **separate** prompts, evidence routers, Master Evidence Banks, templates, Drive folders and cost/status history.

CV pipeline: eligible row → candidate-specific combined Stage 1/2 (or legacy separated stages if configured) → Stage 3 DOCX → normalise/render → deterministic one-page and factual QA → candidate Drive folder → audit/checkpoint manifest → candidate Sheet status/links. Google Drive holds authoritative CV prompts; checked-in `prompts/03_automation_controls.md` adds controlled instructions. Opt-in Web Search is not a default. `run_manifest.json` and `_Resume_Checkpoints` permit bounded re-entry without redoing valid paid stages.

## 5. Authentication and budgets

- GitHub Actions WIF service account performs Google Sheets control/status access; user OAuth with matching Drive permissions performs Drive writing, avoiding personal-Drive service-account storage-quota failures.
- OpenAI keys and OAuth client/refresh secrets belong in Actions Secrets, **never** in source, issues, prompts, browser code or logs.
- Cost guardrail `COST_HARD_STOP_USD` default **$1.75/application**; model tiers, prompts, quotas and budgets may not be changed without approval. `Token_Usage.json` provides estimated—not invoice-grade—costs.
- Fail closed on missing candidate configuration, changed JD, invalid checkpoint or exhausted retries. Never use a real CV job as an initial diagnostic when existing logs/mocks will suffice.

## 6. Test and verification boundaries

- The `main` tree contains **21 Python test files** covering control/safety, Drive/Google auth/retry, handoffs, resume, QA, model presets, candidate sources and networking flow. GitHub Python CI recently passed.
- The alternate `standalone/test/` contains Node regression/parity tests; these are **branch-specific**, not part of the observed `main` Python CI. Existing `standalone/ACCEPTANCE.md` contains uncompleted live acceptance items.
- Local/static reviews and mock tests prove code paths, not that the deployed release is correct. A successful scheduled Action proves the job ran; reconcile manifests/files/status before saying applications completed.

## 7. Operational risks (prioritise investigation, not assumptions)

1. **High — deployment provenance:** establish running Firebase/Cloud Run image/revision and exact source branch/SHA, especially for open PR #24, before patching or rolling back.
2. **High — external services:** OAuth refresh, Google Sheets 429, Drive 403, Cloud Run/Apps Script auth and permissions can impair reads or writes; previous fixes are not proof of current health.
3. **High — shared data isolation:** confirm row and vacancy-scoped writes/readbacks for both candidates, Connections and app progress, especially across UI + worker concurrency.
4. **High — completion visibility:** distinguish GitHub Action success from actual selected job completeness and delivered Drive outputs.
5. **Medium — drift:** README says old minute-17 schedule while `hourly-worker.yml` now uses 7/27/47; old `standalone` text contains conflicting live/not-live descriptions.
6. **Medium — public GitHub repo:** perform a deliberate credential/security review without copying tokens or candidate evidence into public issues.

## 8. Future integration points

- Networking Hub: reuse existing authenticated dashboard, `Connections` tab and `src/automate_cv/connections.py` opt-in verified-contact flow. Implement only after the separate product-spec handoff; keep research and any paid dispatch permission-gated.
- Additional UI/status/reporting: extend Firebase/Cloud Run `standalone` endpoints and the original `webapp` presentation contract as appropriate; verify active deployment baseline before choosing the edit branch.
- Monitoring: use Actions run/job/log IDs, immutable manifests, per-candidate status and cached dashboard reads. Avoid full workbook scans and external paid tests for normal diagnostics.

## 9. Maintenance process & safe rollback

1. Identify affected **component, live deployment and source commit**.
2. Inspect narrow files, relevant Actions job logs, existing manifest and candidate-specific row.
3. Scope a small fix; branch/PR unless emergency procedure approved.
4. Add deterministic regression coverage; test both candidates when shared code changes.
5. Deploy with the established release route only after approval; verify via live readback and status.
6. Record files, cause, tests, revision, user action, residual risk and rollback.

For worker changes, rollback to the last verified Git SHA and leave the generated application files/Sheet state undisturbed. For the Cloud Run dashboard, redeploy/revert to a **verified** earlier live revision (not a guessed branch); preserve auth/secrets and Sheets access; Apps Script can only be a fallback if its functioning live URL is verified.

**Initial backlog:** [GitHub issue #26](https://github.com/abhisheknair607-ux/automate_cv/issues/26). This reference is descriptive; it does not override [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md), approved Networking Hub requirements or user preservation rules.
