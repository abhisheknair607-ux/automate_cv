# CV Automation — Architecture Decisions

## Non-negotiable priorities
1. Output quality and factual accuracy come first.
2. Token/cost efficiency is optimized without removing reasoning capability needed for A-grade work.
3. Abhishek and Pooja are isolated candidate profiles. Candidate-specific prompts, evidence, templates, output names, statuses, and source files must never cross-contaminate.
4. The Summary Doc remains the master consolidated candidate-evidence source unless later measured data justifies an additional retrieval/index layer. It is not removed merely to save tokens.
5. Existing three-stage reasoning is preserved initially. Optimization is measurement-led rather than achieved by blindly shortening prompts.

## Current/target stage design
- Stage 1: candidate-specific Prompt 1 + company/role/link + raw JD.
- Stage 2: candidate-specific Prompt 2 + raw JD + complete Stage 1 + that candidate's Summary Doc.
- Stage 3: candidate-specific Prompt 3 + only context/source files required by Prompt 3 and artifact creation. Existing behavior is preserved until per-stage measurements show safely removable duplication.

Moving a long prompt from inline text to a Drive file does not by itself reduce model input tokens; the model must still receive/read its content. Prefer stable-prefix prompt caching and measured removal of redundant repeated context.

## Level 2 optimization instrumentation
For every candidate application, capture per stage:
- input_tokens
- cached_input_tokens
- uncached_input_tokens
- output_tokens
- estimated stage cost
- total application cost

Keep stable candidate instructions/evidence in consistent ordering before job-specific dynamic content where practical, to improve cache eligibility. Do not shorten/rewrite the user's prompt files merely for cost optimization.

After a representative sample of real applications, compare Stage 1/2/3 token and cached-token usage and optimize the dominant cost only where quality is preserved.

## Multi-profile behavior
One spreadsheet row may create zero, one, or two independent candidate work items.

Pooja controls:
- E = Make CV
- F = Make Cover Letter
- G = Web Search
- K = Pooja status/output state

Abhishek controls:
- H = Make CV
- I = Make Cover Letter
- J = Web Search
- L = Abhishek status/output state

If both candidates are selected on the same row, run two independent candidate workflows against the same company/role/JD. A failure for one candidate must not overwrite or block the other candidate's status/output.

Do not share Stage 1 between candidates unless their Prompt 1 files are later verified to be semantically identical and sharing is proven not to affect quality. Default is independent execution.

## Candidate profiles
Each candidate profile must resolve its own:
- display/full name and filename-safe name
- Prompt 1 / Prompt 2 / Prompt 3
- Summary Doc
- Base CV
- formatting master
- high-experience reference CV
- lower-experience reference CV
- CV/cover-letter rules
- cover-letter template if used
- any other candidate-specific verified source material
- output/status columns

## Google Drive output architecture
All generated application outputs live under one configured Outputs root:

Outputs/
  Company/
    Designation, Location/
      Abhishek/
        CV and requested artifacts
        audit/context files
      Pooja/
        CV and requested artifacts
        audit/context files

Candidate subfolders are required because both candidates can apply to the same company/role/location. Reuse existing company and role/location folders rather than creating duplicates on every run.

If location is unavailable, use the designation alone rather than inventing a location.

Examples:
Outputs/EY/Transfer Pricing Senior Associate, London/Abhishek/...
Outputs/EY/Transfer Pricing Senior Associate, London/Pooja/...

## Hourly worker
The scheduled worker should run hourly, inspect Freshmal first, and make no OpenAI call when no candidate work item is eligible. Production activation remains controlled by AUTOMATION_ENABLED=true.
