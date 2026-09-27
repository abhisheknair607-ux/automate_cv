import argparse
from googleapiclient.discovery import build
from openai import OpenAI
from .config import settings
from .google_auth import credentials


def check_google():
    creds = credentials(settings)
    sheets = build('sheets', 'v4', credentials=creds, cache_discovery=False)
    meta = sheets.spreadsheets().get(
        spreadsheetId=settings.freshmal_spreadsheet_id,
        fields='properties.title,sheets.properties.title',
    ).execute()
    titles = [s['properties']['title'] for s in meta.get('sheets', [])]
    if settings.freshmal_sheet_name not in titles:
        raise RuntimeError(
            f"Configured sheet {settings.freshmal_sheet_name!r} not found; available sheets: {titles}"
        )
    values = sheets.spreadsheets().values().get(
        spreadsheetId=settings.freshmal_spreadsheet_id,
        range=f'{settings.freshmal_sheet_name}!A1:L3',
        valueRenderOption='UNFORMATTED_VALUE',
    ).execute().get('values', [])

    drive = build('drive', 'v3', credentials=creds, cache_discovery=False)
    source_ids = {
        'Prompt1': settings.prompt1_file_id,
        'Prompt2': settings.prompt2_file_id,
        'Prompt3': settings.prompt3_file_id,
        'SummaryRouter': settings.summary_doc_file_id,
        'MasterEvidenceBank': settings.master_evidence_bank_file_id,
        'CVFormattingMaster': settings.cv_formatting_master_file_id,
        'BaseCV': settings.base_cv_file_id,
        'OutputsFolder': settings.drive_output_folder_id,
    }
    checked = {}
    for label, file_id in source_ids.items():
        if not file_id:
            raise RuntimeError(f'{label} file ID is not configured.')
        m = drive.files().get(fileId=file_id, fields='id,name,mimeType').execute()
        checked[label] = m['name']

    print(
        f"GOOGLE_OK spreadsheet={meta['properties']['title']!r} "
        f"sheet={settings.freshmal_sheet_name!r} preview_rows={len(values)}"
    )
    for label, name in checked.items():
        print(f'DRIVE_OK {label}={name!r}')


def check_openai():
    if not settings.openai_api_key:
        raise RuntimeError('OPENAI_API_KEY is not configured.')
    client = OpenAI(api_key=settings.openai_api_key)
    # Deliberately tiny requests: verify key, billing, Responses API and access
    # to every model used by the production routing plan.
    models = list(dict.fromkeys([
        settings.stage1_model,
        settings.stage2_model,
        settings.stage3_model,
    ]))
    for model in models:
        r = client.responses.create(
            model=model,
            input='Reply with exactly: OPENAI_OK',
            max_output_tokens=16,
        )
        text = (r.output_text or '').strip()
        if 'OPENAI_OK' not in text:
            raise RuntimeError(f'Unexpected OpenAI connectivity response from {model}: {text!r}')
        print(f'OPENAI_OK model={model}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--google', action='store_true')
    parser.add_argument('--openai', action='store_true')
    args = parser.parse_args()
    run_google = args.google or not (args.google or args.openai)
    run_openai = args.openai or not (args.google or args.openai)
    if run_google:
        check_google()
    if run_openai:
        check_openai()
    print('CONNECTIVITY_OK')


if __name__ == '__main__':
    main()
