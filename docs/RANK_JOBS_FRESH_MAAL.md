# Fresh Maal: Ranking and Selected Jobs

Main, production spreadsheet: https://docs.google.com/spreadsheets/d/1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc/edit

Pre-change archive (separate copy): https://docs.google.com/spreadsheets/d/1LNdlf6Fh-GGP4EQHk1WwOaHsVJT-kBNM_N74KoE5MXo/edit

## Sheet1: six compact columns appended after AK
AL = Abhishek weighted combined job score; AM = Abhishek score rank;
AN = Pooja weighted combined job score; AO = Pooja score rank;
AP = Abhishek job-selection checkbox; AQ = Pooja job-selection checkbox.

No original CV trigger/status/metadata column was relocated.

## Selected Jobs tab
Change B2 between Abhishek and Pooja to show only jobs ticked for the
selected candidate. Tick AP or AQ in Sheet1 to select a job.
This selection does NOT trigger CV generation. The view includes company,
role, score, rank, location, application status, and vacancy URL.

## On-demand ranking action
Open GitHub -> Actions -> Rank Jobs - Fresh Maal -> Run workflow.
Inputs:
* candidate: both, abhishek, pooja (default both).
* max_jobs: 1-50 unscored jobs PER candidate; default 10. Re-run to
  progressively rank more jobs.
* selected_only: if true, rank only AP/AQ checked jobs, otherwise all.
* refresh: if true, recalculate already scored jobs as well.

The job scoring runner uses the candidate's verified Summary Doc and CURRENT
Ultimate Career Goal plus the full raw JD from the production sheet.
Abhishek has a Deals/Investments priority. Pooja's current primary goal
is Private Wealth and holistic HNW financial advisory; ignore older
PE/VC-primary Pooja ranking guidance where it conflicts with this goal.
Combined score = round(Profile Fit * 0.55 + Career Goal Alignment * 0.45).
Separate Rank columns calculate rank in Google Sheets.

The new ranking runner calls OpenAI API; costs apply when manually triggered.
It uses the existing Google and OpenAI secrets/variables from the CV worker.

The old hourly CV automation is unaffected: it reads A3:AG1000.
The new ranking action writes only score cells AL and AN. Ranks and
selection view are spreadsheet formulas. The ranking action is NEVER
automatically scheduled, and it does not generate CVs.
