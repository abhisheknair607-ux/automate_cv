import argparse

from .runner import (
    annotate_source_telemetry,
    build,
    configure_batch,
    prepare_application,
)


def main():
    parser = argparse.ArgumentParser(
        description='Run exactly one Freshmal row/candidate for controlled testing.'
    )
    parser.add_argument('--row', type=int, required=True)
    parser.add_argument('--candidate', choices=['abhishek', 'pooja'], default='abhishek')
    args = parser.parse_args()

    sheet, workflow = build()
    matches = [
        a for a in sheet.rows()
        if a.row_number == args.row and a.candidate_key == args.candidate
    ]
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
