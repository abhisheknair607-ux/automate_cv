from types import SimpleNamespace

import pytest

from automate_cv.controlled import _configure_pooja_test_sources, _pooja_test_row


def test_test_folder_overrides_only_three_pooja_source_ids(monkeypatch):
    found = []

    class FakeDrive:
        def __init__(self, credentials):
            pass

        def find(self, name, folders):
            found.append((name, folders))
            return {'id': f'test-{name}'}

    monkeypatch.setattr('automate_cv.drive.Drive', FakeDrive)
    monkeypatch.setattr('automate_cv.google_auth.credentials', lambda settings: object())
    monkeypatch.setenv('POOJA_PROMPT1_FILE_ID', 'production-prompt')
    monkeypatch.setenv('PROMPT1_FILE_ID', 'abhishek-prompt')
    _configure_pooja_test_sources('test-folder')
    assert len(found) == 3
    assert all(folder == ['test-folder'] for _, folder in found)
    assert __import__('os').environ['POOJA_BASE_CV_FILE_ID'] == 'test-TEST_POOJA_BASE_CV.docx'
    assert __import__('os').environ['POOJA_PROMPT1_FILE_ID'] == 'production-prompt'
    assert __import__('os').environ['PROMPT1_FILE_ID'] == 'abhishek-prompt'


def test_controlled_row_can_run_without_ticking_production_checkbox():
    row = ['EY', 'Senior Consultant', 'link', 'job description'] + [False] * 29
    row[10] = 'ERROR'
    row[24] = 'ERROR_CONFIG'

    class Values:
        def get(self, **kwargs):
            assert kwargs['range'].endswith('A13:AG13')
            return self

        def execute(self):
            return {'values': [row]}

    sheet = SimpleNamespace(values=Values(), settings=SimpleNamespace(
        freshmal_spreadsheet_id='id', freshmal_sheet_name='Sheet1'))
    app = _pooja_test_row(sheet, 13)
    assert app.make_cv and app.candidate_key == 'pooja'
    assert app.folder_name == 'Pooja Controlled Tests'
    assert app.filename_name.startswith('TEST_ONLY')
    row[5] = True
    with pytest.raises(SystemExit, match='untick F and G'):
        _pooja_test_row(sheet, 13)
