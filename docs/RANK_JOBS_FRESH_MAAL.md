# Fresh Maal: ChatGPT ranking and Selected Jobs (no ranking API)

Main spreadsheet: https://docs.google.com/spreadsheets/d/1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc/edit

Pre-change backup: https://docs.google.com/spreadsheets/d/1LNdlf6Fh-GGP4EQHk1WwOaHsVJT-kBNM_N74KoE5MXo/edit

## Score, rank and selection columns (Sheet1)

- AL: Abhishek combined score (0–100)
- AM: Abhishek rank, automatically calculated from AL
- AN: Pooja combined score (0–100)
- AO: Pooja rank, automatically calculated from AN
- AP: Abhishek's job-selection checkbox
- AQ: Pooja's job-selection checkbox

The Selected Jobs tab includes a B2 dropdown (Abhishek/Pooja) and shows
only that candidate's checked jobs. Checkboxes do not generate CVs.

## Ranking with ChatGPT — no OpenAI API

In the A - JA ChatGPT Project, request: **Run Rank Jobs for Abhishek**,
**Run Rank Jobs for Pooja**, or **Run Rank Jobs for both**. Mention
"selected jobs only" if desired.

ChatGPT should:
1. Read the current complete Rank - Job prompt for each selected candidate,
   that candidate's Summary Doc, current Ultimate Career Goal, and the complete
   job descriptions in Sheet1.
2. Apply the candidate-specific evidence, scoring and weighting instructions.
   Respect Pooja's currently primary Private Wealth direction and Abhishek's
   Deals/Investment direction; avoid unsupported experience claims.
3. Match each assessed job to the same Sheet1 vacancy by exact row and
   verify company, role, vacancy link and JD to avoid overwriting another job.
4. Write **only the combined integer score** to AL for Abhishek and/or
   AN for Pooja, via the connected Google Drive/Sheets plugin.
   AM/AO rank formulas recalculate; don't overwrite those formulas.
   Do not change CV triggers, existing statuses, or unrelated columns.
5. Report completed counts and any errors, missing sources or unscored jobs.

A ChatGPT chat request performs ranking during the conversation. It does
not create a background GitHub ranking job. The former OpenAI API ranking
action and script were deliberately removed at the user's request;
**no ranking-related OpenAI API calls** should occur.

The existing GitHub hourly CV worker remains separate and unchanged, and
may still use an OpenAI API for CV production. It reads Sheet1 A3:AG1000.
Its pre-existing Google OAuth issue is independent of the ranking changes.

Combined Score: round(Profile Fit * 0.55 + Career Alignment * 0.45).
