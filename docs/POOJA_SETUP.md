# Pooja Profile Setup

Freshmal controls reserved for Pooja:
- E: Make CV
- F: Make Cover Letter
- G: Web Search
- K: status/output state
- W:AF: hidden Pooja workflow/checkpoint state

Freshmal AG is an optional Location field used for the output folder name. If AG is blank, the workflow uses the designation alone and does not invent a location.

## Google Drive source folder
A raw source folder has been prepared under the existing `Automate CV` folder:

`Automate CV / Pooja Sources`

Folder ID:
`1mlxbfKT672OJQH8Diehv0QVS6caUr5wA`

Place Pooja's verified source files there. Do not reuse Abhishek source IDs or project folders.

## Required GitHub repository Variables
Add the Drive file IDs for Pooja's own files:
- POOJA_PROMPT1_FILE_ID
- POOJA_PROMPT2_FILE_ID
- POOJA_PROMPT3_FILE_ID
- POOJA_SUMMARY_DOC_FILE_ID
- POOJA_MASTER_EVIDENCE_BANK_FILE_ID
- POOJA_BASE_CV_FILE_ID
- POOJA_CV_FORMATTING_MASTER_FILE_ID
- POOJA_CV_COVER_LETTER_RULES_FILE_ID

Optional/configuration-dependent:
- POOJA_HIGH_EXPERIENCE_REFERENCE_FILE_ID
- POOJA_LOWER_EXPERIENCE_REFERENCE_FILE_ID
- POOJA_COVER_LETTER_TEMPLATE_FILE_ID
- POOJA_FINAL_PROJECTS_FOLDER_ID
- POOJA_PROJECTS_FOLDER_ID

Use GitHub repository Variables for these non-sensitive IDs. OAuth/OpenAI credentials stay in GitHub Secrets.

The workflow fails closed with ERROR_CONFIG before making an OpenAI call if a required Pooja profile file ID is missing.

## Prompt handling
Keep Pooja's approved Prompt 1/2/3 contents unchanged. The code selects Pooja's files based on `candidate_key=pooja`; it does not rewrite her prompt files for token reduction.

## Output path
Pooja output is separated immediately below Outputs:

`Outputs / Pooja / Company / Designation, Location / ...`

Abhishek remains:

`Outputs / Abhishek / Company / Designation, Location / ...`

## Isolation acceptance tests before Pooja production use
1. E only -> Pooja CV generated; Abhishek state is untouched.
2. E+F -> Pooja CV + Cover Letter generated.
3. E+G -> Pooja CV with Web Search enabled; no Cover Letter is required.
4. H only -> Abhishek CV generated; Pooja state is untouched.
5. E+H on the same row -> two independent CVs using separate prompts/evidence.
6. Force a Pooja error -> K/Pooja state changes, while L/Abhishek state remains unaffected.
7. Force an Abhishek error -> Abhishek state changes, while Pooja remains unaffected.
8. Verify Drive outputs land under separate candidate roots.
9. Verify run_manifest.json for each candidate contains that candidate's prompt/JD hashes only.
10. Verify Factual_QA.md checks each final CV against that candidate's detailed Master Evidence Bank.

Do not tick Pooja Make CV in production until all required Pooja file IDs are configured and the controlled Pooja test passes.

## October 2026 evidence update

See [the Pooja evidence update](POOJA_EVIDENCE_UPDATE_2026-10-04.md) for the additive Summary Doc, populated Master Evidence Bank, exact evidence keys and validation steps.
