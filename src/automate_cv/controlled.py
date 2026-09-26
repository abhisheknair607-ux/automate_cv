import argparse
from .runner import build


def main():
    parser = argparse.ArgumentParser(description='Run exactly one Freshmal row for controlled testing.')
    parser.add_argument('--row', type=int, required=True)
    args = parser.parse_args()

    sheet, workflow = build()
    matches = [a for a in sheet.rows() if a.row_number == args.row]
    if not matches:
        raise SystemExit(f'Freshmal row {args.row} was not found.')

    app = matches[0]
    if not sheet.eligible(app):
        raise SystemExit(
            f'Freshmal row {args.row} is not eligible. '
            f'Make CV={app.make_cv}, status={app.status!r}, lock={app.lock_id!r}'
        )

    print(f'CONTROLLED TEST: processing only row {app.row_number}: {app.company} | {app.designation}')
    workflow.run(app)


if __name__ == '__main__':
    main()
