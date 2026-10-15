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
- AX / AY: Abhishek Profile Fit / Career Fit (0–100, evidence-based input)
- AZ / BA: Pooja Profile Fit / Career Fit (0–100, evidence-based input)

The Garamaal job card displays **Profile Fit**, **Career Fit**, **Avg 55/45**
(existing weighted combined AL/AN), and **Rank** (AM/AO). AX:BA were added
in October 2026 but historical job sub-scores were not retained; the app
must display a dash when those two components are missing, not infer them
from the combined score.

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
4. Write the **combined integer score** to AL for Abhishek and/or AN
   for Pooja, via the connected Google Drive/Sheets plugin. Where the
   current evidence and score rubric separately support Profile Fit and
   Career Fit values, also write those exact components to AX/AY for
   Abhishek or AZ/BA for Pooja. Do not invent missing historical components.
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

## Garamaal preferences and saved-JD transfer

- Taaza Jobs!N/O and Freshmaal Sheet1!AT/AU are per-candidate job
  preferences: blank, Not Interested or Favorite. A confirmed one-time
  conversion of the old Boolean checkbox cells is available on Garamaal's
  dashboard after the new Cloud Run code is deployed.
- Favorite jobs remain eligible for normal listings, Make CV and ranking.
  Not Interested jobs are hidden in normal views but recoverable.
- Saving a completed JD **through Garamaal** transfers a new vacancy into
  Freshmaal automatically, without checking Make CV/CL or modifying any
  already-existing Freshmaal JD or CV output.
- Direct edits in Google Sheets are visible after cache expiry. To trigger
  immediate transfer from a direct Sheet edit, use the existing transfer
  workflow; the Garamaal auto-transfer runs on its JD Save operation.
