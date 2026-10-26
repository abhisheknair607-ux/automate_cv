# Taaza duplicate detection — staged rollout

**Stage 1 status:** Python engine and local regression tests only. No live Sheets access, no API calls, no deletions, no dashboard changes, no merge and no deployment.

## Stage 1 — standalone, read-only matcher

- Source: `src/automate_cv/job_dedupe.py`
- Tests: `tests/test_job_dedupe.py`
- Exact: verified provider job ID or normalized URL; no tracking parameters.
- Possible: same normalized company, same recognized city, similar job designation. Different manager grades are protected.
- Audit result groups related master Jobs rows without deleting, moving or changing anything. The match score is heuristic text similarity, not a probability.
- Mirrored rows in regional feeder tabs are normal: do not count a master row and its source as a duplicate in the Jobs cleanup scan.
- Stage 1 uses the Python standard library; **no AI or Sheets APIs**.

Example local audit command:

```sh
PYTHONPATH=src pytest -q tests/test_job_dedupe.py
PYTHONPATH=src python -m automate_cv.job_dedupe --input local_jobs.json --output local_report.json
```

JSON inputs are local arrays with `sheet`, `row`, `company`, `title`, `location`, `url`, and optional `has_jd` / `protected`. Every match has `auto_delete=false`.

## Stage 2 — read-only real Taaza audit (requires approval)

- Check exact live workbook schema and use authenticated read-only access.
- Audit master Jobs rows and compare incoming items against master and feeder tabs; show pairs and grouped results in ChatGPT.
- No writes or deletes, and no parser approval implied.

## Stage 3 — duplicate status and Garamaal UI (requires approval)

- Verify that Jobs column Q is available before adding a single `Duplicate Status` dropdown (blank, Possible, Dup, Not Dup). Preserve A:P and existing values.
- Add `Dup` beside Paste JD, Trash and Heart; add a duplicates preset and grouped review.
- Backend must authenticate user, verify job identity before updating status, and preserve manual Not Dup decisions.
- Keep candidate-specific N/O and master Jobs!P categories unchanged.

## Stage 4 — integrate importer and safe cleanup, then release (requires approval)

- Apply the shared matcher inside the staged Gmail importer and existing regional master sync to prevent re-imported exact duplicates.
- Manual GitHub Actions execution. No OpenAI API. Gmail readonly + Sheets APIs still needed.
- For exact duplicates: skip new repeated arrivals; only physically remove dependency-free redundant historical records after a verified backup and separate signoff.
- Never automatically delete fuzzy matches, transferred jobs, rows with unique JD/history, or change Make CV workflows.
- Controlled merge and `garamaal.web.app` deployment only after explicit approval and QA.

**Change control:** the assistant maintains GitHub branches, tests, PRs and (once approved and deployment tools are available) release actions. The user reviews and approves each stage here rather than running commands.