import argparse
import json
from collections import Counter
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


def configure_batch(workflow, apps):
    """Configure cache and per-application source behavior for this batch.

    GPT-5.6's guaranteed cache lifetime is 30 minutes while the production worker
    runs hourly. Cache writes are therefore enabled only when the same candidate
    has at least two applications in the current run; those applications are kept
    adjacent and can reuse the cache immediately.
    """
    counts = Counter(a.candidate_key for a in apps)
    workflow.ai.cache_candidates = {key for key, count in counts.items() if count >= 2}


def prepare_application(workflow, app):
    # Workflow.run predates conditional source loading, so Sources carries this
    # per-row flag. Execution is sequential; it is reset before every application.
    workflow.sources.make_cover_letter = bool(app.make_cl)
    workflow.sources.last_stage3_telemetry = []
    workflow.sources.last_selected_evidence_ids = []


def annotate_source_telemetry(workflow, app):
    """Add exact Stage 3 source names/sizes to the already-created Token_Usage.json.

    Telemetry is an audit enhancement and must never turn a successfully created CV
    into an ERROR merely because the audit rewrite fails.
    """
    telemetry = list(workflow.sources.last_stage3_telemetry or [])
    if not telemetry:
        return
    usage_path = Path(workflow.s.workdir) / app.application_id / 'Token_Usage.json'
    if not usage_path.exists():
        return
    try:
        data = json.loads(usage_path.read_text(encoding='utf-8'))
        data['stage3_sources'] = telemetry
        data['stage3_selected_evidence_ids'] = list(
            workflow.sources.last_selected_evidence_ids or []
        )
        stage3 = data.get('latest_stage_usage', {}).get('stage3')
        if isinstance(stage3, dict):
            stage3['sources'] = telemetry
            stage3['source_count'] = len(telemetry)
            stage3['source_bytes_total'] = sum(int(x.get('bytes', 0) or 0) for x in telemetry)
        for event in reversed(data.get('usage_history', [])):
            if isinstance(event, dict) and event.get('stage') == 'stage3':
                event['sources'] = telemetry
                event['source_count'] = len(telemetry)
                event['source_bytes_total'] = sum(
                    int(x.get('bytes', 0) or 0) for x in telemetry
                )
                break
        usage_path.write_text(json.dumps(data, indent=2), encoding='utf-8')
        folder, _ = workflow._folders(app)
        workflow.drive.upload(usage_path, folder)
    except Exception as error:
        print(
            f'[runner] WARNING: could not annotate Stage 3 source telemetry for '
            f'{app.candidate_key} row {app.row_number}: {type(error).__name__}: {error}',
            flush=True,
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not settings.automation_enabled and not args.dry_run:
        print('AUTOMATION_ENABLED=false; no work performed.')
        return

    sheet, workflow = build()
    apps = [a for a in sheet.rows() if sheet.eligible(a)]
    # Group candidate work so cacheable applications are adjacent within the same run.
    apps.sort(key=lambda a: (a.candidate_key, a.row_number))
    apps = apps[:settings.max_applications_per_run]
    configure_batch(workflow, apps)

    if args.dry_run:
        for a in apps:
            print(
                a.candidate_key,
                a.row_number,
                a.company,
                a.designation,
                'CL=',
                a.make_cl,
                'WS=',
                a.web_search,
                'CACHE=',
                a.candidate_key in workflow.ai.cache_candidates,
            )
        return

    if not apps:
        print('No eligible Freshmal candidate work items; no OpenAI workflow calls made.')
        return

    failures = []
    for app in apps:
        try:
            prepare_application(workflow, app)
            workflow.run(app)
            annotate_source_telemetry(workflow, app)
        except Exception as error:
            failures.append((app, error))
            print(
                f'[runner] {app.candidate_key} row {app.row_number} failed: '
                f'{type(error).__name__}: {error}',
                flush=True,
            )
            continue

    if failures:
        summary = '; '.join(
            f'{a.candidate_key}/row {a.row_number}: {type(e).__name__}' for a, e in failures
        )
        raise RuntimeError(f'{len(failures)} application(s) failed in this batch: {summary}')


if __name__ == '__main__':
    main()
