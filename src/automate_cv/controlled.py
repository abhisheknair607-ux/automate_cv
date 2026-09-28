import argparse
import os

from .runner import (
    annotate_source_telemetry,
    build,
    configure_batch,
    prepare_application,
)


def _pooja_test_row(sheet, row_number):
    """Read a controlled Pooja row even when production Make CV is unticked."""
    from .freshmal import LOCATION_COL, _b, _v
    from .models import ApplicationRow
    from .profiles import profiles

    p = profiles()['pooja']
    result = sheet.values.get(
        spreadsheetId=sheet.settings.freshmal_spreadsheet_id,
        range=f'{sheet.settings.freshmal_sheet_name}!A{row_number}:AG{row_number}',
        valueRenderOption='UNFORMATTED_VALUE',
    ).execute()
    rows = result.get('values', [])
    if not rows:
        raise SystemExit(f'Freshmal row {row_number} is empty.')
    row = rows[0]
    state = [_v(row, p.state_start_col + i) for i in range(10)]
    if _b(row, p.make_cl_col) or _b(row, p.web_search_col):
        raise SystemExit('Pooja test sources support CV-only; untick F and G for this test.')
    return ApplicationRow(
        row_number=row_number, company=str(_v(row, 0)),
        designation=str(_v(row, 1)), application_link=str(_v(row, 2)),
        raw_jd=str(_v(row, 3)), make_cv=True, make_cl=False,
        web_search=False, status=str(_v(row, p.status_col)),
        candidate_key='pooja', candidate_name=p.display_name,
        filename_name='TEST_ONLY_Pooja_Tirupati',
        folder_name='Pooja Controlled Tests',
        location=str(_v(row, LOCATION_COL)).strip(),
        application_id=str(state[0]), jd_hash=str(state[1]),
        workflow=str(state[2]), lock_id=str(state[3]),
        cv_link=str(state[5]), cl_link=str(state[6]),
        context_link=str(state[7]), cost_usd=float(state[8] or 0),
        error=str(state[9]),
    )


def _configure_pooja_test_sources(folder_id):
    from .config import settings
    from .drive import Drive
    from .google_auth import credentials

    drive = Drive(credentials(settings))
    names = {
        'POOJA_SUMMARY_DOC_FILE_ID': 'TEST_POOJA_SUMMARY_ROUTER.docx',
        'POOJA_MASTER_EVIDENCE_BANK_FILE_ID': 'TEST_POOJA_MASTER_EVIDENCE_BANK.docx',
        'POOJA_BASE_CV_FILE_ID': 'TEST_POOJA_BASE_CV.docx',
    }
    for variable, filename in names.items():
        file = drive.find(filename, [folder_id])
        if not file:
            raise SystemExit(f'Pooja controlled test folder is missing {filename}.')
        os.environ[variable] = file['id']


def main():
    parser = argparse.ArgumentParser(
        description='Run exactly one Freshmal row/candidate for controlled testing.'
    )
    parser.add_argument('--row', type=int, required=True)
    parser.add_argument('--candidate', choices=['abhishek', 'pooja'], default='abhishek')
    args = parser.parse_args()
    if args.row < 3:
        raise SystemExit('Choose a Freshmal data row (3 or higher).')

    test_folder = os.getenv('POOJA_TEST_FOLDER_ID', '').strip()
    if test_folder and args.candidate != 'pooja':
        raise SystemExit('Pooja test sources can only be used with candidate=pooja.')
    if test_folder:
        _configure_pooja_test_sources(test_folder)

    sheet, workflow = build()
    matches = ([_pooja_test_row(sheet, args.row)] if test_folder else [
        a for a in sheet.rows()
        if a.row_number == args.row and a.candidate_key == args.candidate
    ])
    if not matches:
        raise SystemExit(
            f'Freshmal row {args.row} has no {args.candidate} candidate work item. '
            'Check that candidate controls are selected.'
        )

    app = matches[0]
    if not sheet.eligible(app):
        raise SystemExit(
            f'Freshmal row {args.row}/{args.candidate} is not eligible. '
            f'Make CV={app.make_cv}, status={app.status!r}, '
            f'workflow={app.workflow!r}, lock={app.lock_id!r}'
        )

    # A controlled single-row run deliberately does not pay a GPT-5.6 cache-write
    # premium because there is no second same-candidate request in this batch.
    configure_batch(workflow, [app])
    prepare_application(workflow, app)

    print(
        f'CONTROLLED TEST: {app.candidate_key} row {app.row_number}: '
        f'{app.company} | {app.designation}'
    )
    workflow.run(app)
    annotate_source_telemetry(workflow, app)


if __name__ == '__main__':
    main()
