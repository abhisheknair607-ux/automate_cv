# Garamaal — Automatic JD Recovery + Default Smart Sort (Feature Branch)

Branch: `feature/jd-recovery-smart-sort-20261027`

**Review only. Not merged, not deployed, and no production Sheet write has been run.**

## User-visible contract

- Discovery retains *all* distinct records, including those already transferred to Make CV, and remains the JD editor.
- Candidate-specific **Smart Sort** is selected whenever Discovery is entered, including after switching away and back. Other sorts may be chosen during that visit. Existing filters, user preferences and duplicate review remain in place.
- Verified complete JDs received through the recovery process are represented as **Automatic JD** in Discovery and Make CV.
- Partial/summary/unknown postings remain Discovery **Needs JD**, without new panels.
- No CV/CL generation is dispatched by recovery.
- Discovery edits of auto-recovered JDs synchronize with the matching Freshmaal row only when the original JD, job identity and CV workflow lock checks permit; old manually transferred JDs retain the pre-existing explicit sync action.

## Recovery approach

- `src/automate_cv/jd_recovery.py` is a **read-only-by-default** worker; prioritizes candidate-related finance, transfer pricing and wealth roles. Uses public Greenhouse/Lever/Ashby/SmartRecruiters endpoints, and eligible employer JobPosting JSON-LD. Requires a matching vacancy title plus substantial responsibilities and qualification sections, not an SEO snippet.
- LinkedIn-only or inaccessible pages return **Needs JD**. A full employer-matched alternative source discovery/search module is not yet included; this is a staged enhancement rather than permission to mislabel short summaries as full descriptions.
- Matching Make CV rows are reused and protected; no duplicate CV output generation.
- The scheduler's live write needs `GARAMAAL_JD_RECOVERY_APPROVED=true`; branch is not activated by GitHub Actions schedules. To test without Sheet writes, use a manual preview or the automated Python/Node tests.

## Before future publication

1. Run the complete **tests** and **JD recovery and Smart Sort regression tests** checks at the branch head. Repeat full standalone UI safety suite, including mobile candidate switching, filters, and current production view.
2. Test recovery against *copied* Taaza and Freshmaal Sheets with `--apply`; verify no duplicate records, lock violations, or status changes. The current tests use synthetic inputs and do not prove live provider extraction rates.
3. Review the existing UI protection check. It intentionally forbids changes to the legacy `webapp/` controller and unreviewed Python modules. Do **not** relax this safety gate silently or merge this branch until reviewed and validated.
4. Confirm no whole-JD previews or worker log text disclose confidential data. Verify GitHub Actions service permissions.
5. Merge only after approval; run a separate gated canary, then publish Cloud Run/Firebase in a separate release. Keep a known-good rollback revision. Enable scheduled live writes only with a second explicit sign-off.

## Notes

- Smart Sort is a transparent, deterministic relevance heuristic, **not** an ATS percentage or a full-JD match score.
- The existing Freshmaal 55/45 ranking and CV model presets are unchanged.
- Neither manual rejections nor previous CV-generated documents are deleted or overwritten.
- Initial live read-only inspection identified 742 Discovery entries, 621 placeholder JDs, 34 blank JDs, and 87 populated JD fields, as of 27 October 2026.
