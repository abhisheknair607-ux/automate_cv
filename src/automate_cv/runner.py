import argparse
from pathlib import Path
from .config import settings
from .google_auth import credentials
from .freshmal import Freshmal
from .drive import Drive
from .prompts import Prompts
from .openai_client import AI
from .workflow import Workflow


def build():
    creds = credentials(settings)
    sheet = Freshmal(creds, settings)
    drive = Drive(creds)
    root = Path(__file__).resolve().parents[2]
    return sheet, Workflow(settings, sheet, drive, AI(settings), Prompts(drive, settings, root))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not settings.automation_enabled and not args.dry_run:
        print('AUTOMATION_ENABLED=false; no work performed.')
        return

    sheet, workflow = build()
    apps = [a for a in sheet.rows() if sheet.eligible(a)]
    # Group candidate work so repeated candidate prompts/evidence stay adjacent for cache-friendly execution.
    apps.sort(key=lambda a: (a.candidate_key, a.row_number))
    apps = apps[:settings.max_applications_per_run]

    if args.dry_run:
        for a in apps:
            print(a.candidate_key, a.row_number, a.company, a.designation, 'CL=', a.make_cl, 'WS=', a.web_search)
        return

    if not apps:
        print('No eligible Freshmal candidate work items; no OpenAI workflow calls made.')
        return

    failures = []
    for app in apps:
        try:
            workflow.run(app)
        except Exception as error:
            failures.append((app, error))
            print(
                f'[runner] {app.candidate_key} row {app.row_number} failed: '
                f'{type(error).__name__}: {error}',
                flush=True,
            )
            # Continue processing other candidate jobs so one failure cannot block the entire hourly batch.
            continue

    if failures:
        summary = '; '.join(
            f'{a.candidate_key}/row {a.row_number}: {type(e).__name__}' for a, e in failures
        )
        raise RuntimeError(f'{len(failures)} application(s) failed in this batch: {summary}')


if __name__ == '__main__':
    main()
