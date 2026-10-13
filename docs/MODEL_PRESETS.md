# CV model presets — per job and candidate

The **Freshmaal** sheet remains the single source of CV/CL/WS checkbox commands. Its columns A:AQ and CV worker schedules stay unchanged. AR selects Abhishek's model tier, AS selects Pooja's. Both have the allowed values **Economy, Balanced, Premium**. A blank value retains **Premium**, preserving historic workflows.

| Tier | Stage 1 | Stage 2 | Stage 3 |
| --- | --- | --- | --- |
| Economy | gpt-6-luna | gpt-6-luna | gpt-6-luna |
| Balanced | gpt-6-luna | gpt-6-luna | gpt-6.1-sol |
| Premium | gpt-5.6-terra | gpt-5.6-terra | gpt-5.6-sol |

The **merged-analysis** setting remains active: stages 1+2 are one model call using the stage 2 mapping. Changing AR/AS alone never re-runs a completed application. Re-request a CV through the existing checkbox/retry workflow if a new model choice is wanted. Any workflow already in progress uses a snapshot of the model configuration taken before starting that application. Costs use the OpenAI API standard price table as of 2026-10-13; estimates are not actual token savings guarantees.

## Safeguards
- Only tier labels are accepted in Sheets, not arbitrary user-supplied model IDs.
- Invalid explicit tier fails before any OpenAI API request.
- Premium matches the original stage choices, and source prompts/QA/output naming remain unchanged.
- Per-job routing uses a **copy** of global settings, never modifies the shared settings object across Abhishek/Pooja.
- Checkpoint keys already include the effective per-job model and reasoning; a different stage 3 model cannot reuse the old output automatically.
- Changing a tier while a job is locked must be prevented by the webpage; avoid direct sheet edits during active runs.
- **Economy Stage 3 quality is unvalidated**, despite OpenAI listing Code Interpreter support. Before choosing it for important vacancies, perform an end-to-end test including DOCX generation/QA.
- No changes to discovery importer or GitHub scheduler.
- Live end-to-end tests still depend on the existing worker's Google OAuth credentials.
