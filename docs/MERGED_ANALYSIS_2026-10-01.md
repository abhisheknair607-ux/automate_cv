# Combined analysis and template formatting

The default worker combines the configured Prompt 1 and Prompt 2 into one analysis call. It first fixes the employer requirements independently, then selects candidate evidence against those requirements. All substantive source rules remain in the combined prompt; only old separate-call transition instructions are replaced. Both machine handoffs and stage1.md / stage2.md reports remain available, together with stage1_2.md and the exact effective prompts.

Existing Drive prompt IDs remain valid. The original source files remain editable policy inputs; no Actions variable or Sheet migration is required. `MERGED_ANALYSIS=false` retains the separate analysis route. Generation, optional cover letters, optional web search, candidate separation, ATS reporting, factual QA, cost accounting, retry controls, completion statuses and Sheet links remain operative.

Combined checkpoint reuse requires the same JD, company, role, location, vacancy link, both prompts, evidence router and analysis settings, plus both saved reports. Changed inputs invalidate downstream work. Paid combined-call usage is saved before handoff validation; missing handoffs fail closed. Existing cumulative cost limits remain in force.

Stage 3 receives reusable `template_editing.py` utilities rather than repeatedly building generic DOCX manipulation code. Paragraph/run prototypes preserve geometry, tabs, borders, numbering, headers/footers and relationships. Abhishek's High/Lower templates and Pooja's locked layout remain distinct. The supplied Formatting Master remains authoritative. Wording and evidence refinement precede permitted layout adjustments. Genuine rendering and visual review remain required; unavailable rendering must not be represented as completed visual QA.

The regression suite covers combined calls, checkpoint reuse/invalidation, handoffs, source-rule retention, template cloning, links, bold controls and geometry. A real Abhishek template clone and an edited copy were rendered to one-page outputs; their rendered images were identical. This is a formatting utility check, not proof that every future tailored CV has identical quality. A same-JD production comparison is still needed to measure actual cost, latency and CV quality; no numerical saving is guaranteed.

## Mobile test

Use a fresh row in Freshmal. Fill company, designation, vacancy link and the full raw JD in A:D; AG location is optional. Tick H for Abhishek's CV. Tick I only for a cover letter and J only for web search. Leave L blank or NA. The scheduled worker checks eligible rows hourly at minute 17; GitHub scheduling can be delayed. Success writes a CV link and CV/CV+CL/CV+CL+WS status. A completed or Applied row is skipped even if Make CV remains checked.

Pooja's current production Master Evidence Bank contains `PLACEHOLDER — DO NOT RUN AUTOMATION`. The worker now rejects that source before paid analysis. Her evidence bank and router need verified content compatible with the deterministic evidence selector before her candidate path can be tested; unsupported claims are never generated to bypass this blocker.

## Restoration

The pre-change repository is preserved at `backup/pre-merge-2026-10-01`, commit `17b7076e1984f171e206558dcca2b1096d197e70`. The separate backup ZIP contains repository/history, current prompt copies, supplied sources and a bounded Sheet snapshot; native Drive copies of all six prompts and Freshmal are also preserved. Credentials and secrets are excluded. Original prompt source IDs were not overwritten. Restore repository code from the backup branch for a complete code rollback.
