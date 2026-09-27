import argparse
from .runner import build


def main():
    parser = argparse.ArgumentParser(description='Run exactly one Freshmal row/candidate for controlled testing.')
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
            f'Make CV={app.make_cv}, status={app.status!r}, workflow={app.workflow!r}, lock={app.lock_id!r}'
        )

    print(
        f'CONTROLLED TEST: {app.candidate_key} row {app.row_number}: '
        f'{app.company} | {app.designation}'
    )
    workflow.run(app)


if __name__ == '__main__':
    main()
