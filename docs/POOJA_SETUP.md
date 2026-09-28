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

The folder contains Pooja's own sources. Its files are named with their corresponding
`POOJA_*_FILE_ID` variable followed by a descriptive name. Keep their Drive IDs in
repository Variables; never commit them to this public repository.

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

The workflow fails closed with ERROR_CONFIG before making an OpenAI call if a required Pooja profile file ID is missing. The new base CV, Master Evidence Bank, rules, cover-letter template and both reference CVs are placeholders until Pooja supplies approved content. Do not start a controlled or hourly Pooja run while they still contain placeholder text.

## Pooja router and evidence bank format

The existing Summary Doc contains detailed prose; convert it into a compact router
when filling Pooja's new bank. The router should name the exact evidence IDs and
briefly point to their classification and location. Stage 2 sees this router.
The Master Evidence Bank contains the verified details, qualifications, ownership
boundaries, project maturity and exact supported metrics. Each independently
retrievable block must begin on its own line with this form:

```text
EVIDENCE_ID: PR-BROKER-MORTGAGE
Classification: professional experience
Verified facts and outcomes here.

EVIDENCE_ID: PROJ-LIFEGOALS
Classification: independent project
Verified scope and ownership here.
```

Use `PR-`, `PROJ-`, `QUAL-`, `EDU-`, `SKILL-` and `ACH-` prefixes with uppercase
letters, digits and hyphens. Pooja's Stage 2 handoff must select IDs that exist
in both the router and bank. A missing or duplicate bank ID stops Stage 3 rather
than silently uploading the whole bank. Selected blocks alone go to Stage 3;
the full bank remains available locally for factual QA.

The two reference CV variables can remain unset until approved reference CVs
are ready. Stage 2 chooses a High or Lower Experience structure, and only the
matching configured reference is included. The cover-letter rules and template
are included only when Cover Letter is selected.

## Prompt handling
Keep Pooja's approved Prompt 1/2/3 Drive contents unchanged. The worker adds
Pooja-only handoff instructions at runtime. Prompt 3 uses the `# Source Files`
section for its automation control insertion; Abhishek keeps his existing marker.

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
10. Verify Factual_QA.md checks each final CV against that candidate's Master Evidence Bank.

Do not tick Pooja Make CV in production until all required Pooja file IDs are configured and the controlled Pooja test passes.
