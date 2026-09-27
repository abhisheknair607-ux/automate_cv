# Pooja Profile Setup

The codebase reserves these Freshmal controls for Pooja:
- E: Make CV
- F: Make Cover Letter
- G: Web Search
- K: status/output state

## Prepare Pooja's source folder in Google Drive
Create a candidate source folder such as `CV Automation Sources/Pooja/` and place the verified Pooja versions of the files required by her prompts. Do not reuse Abhishek source IDs.

Expected configuration variables (add only when the corresponding file exists/Prompt 3 requires it):
- POOJA_PROMPT1_FILE_ID
- POOJA_PROMPT2_FILE_ID
- POOJA_PROMPT3_FILE_ID
- POOJA_SUMMARY_DOC_FILE_ID
- POOJA_BASE_CV_FILE_ID
- POOJA_CV_FORMATTING_MASTER_FILE_ID
- POOJA_HIGH_EXPERIENCE_REFERENCE_FILE_ID
- POOJA_LOWER_EXPERIENCE_REFERENCE_FILE_ID
- POOJA_CV_COVER_LETTER_RULES_FILE_ID
- POOJA_COVER_LETTER_TEMPLATE_FILE_ID (optional)

Use GitHub repository Variables for non-sensitive Google Drive file IDs. Do not put OAuth/OpenAI secrets into variables.

## Prompt handling
Keep Pooja's prompt contents exactly as approved. The profile wiring should select her files; it should not rewrite prompt contents for token reduction.

## Isolation acceptance test
Before enabling Pooja in production, use a test row and verify:
1. E only -> Pooja CV generated; Abhishek is untouched.
2. E+F -> Pooja CV + CL generated.
3. E+G -> Pooja CV with requested web-search path.
4. H only -> Abhishek CV generated; Pooja is untouched.
5. E+H on the same row -> two independent CVs, each using only that candidate's prompts/sources.
6. A forced Pooja failure does not overwrite Abhishek status, and vice versa.
7. Output paths follow Outputs/Company/Designation, Location/Candidate/.

Do not enable Pooja production processing until all required Pooja file IDs exist and these isolation tests pass.
