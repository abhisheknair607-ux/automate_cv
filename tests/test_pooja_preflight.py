import shutil

from docx import Document

from automate_cv.sources import Sources


class Drive:
    def __init__(self, files):
        self.files = files

    def download_named(self, file_id, workdir):
        from pathlib import Path
        destination = Path(workdir) / self.files[file_id].name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.files[file_id], destination)
        return destination


def document(path, text):
    d = Document()
    d.add_paragraph(text)
    d.save(path)
    return path


def test_pooja_preflight_blocks_unfinished_router_bank_and_base(tmp_path, monkeypatch):
    monkeypatch.setenv('POOJA_SUMMARY_DOC_FILE_ID', 'router')
    monkeypatch.setenv('POOJA_MASTER_EVIDENCE_BANK_FILE_ID', 'bank')
    monkeypatch.setenv('POOJA_BASE_CV_FILE_ID', 'base')
    files = {
        'router': document(tmp_path/'router.docx', 'Professional experience without IDs'),
        'bank': document(tmp_path/'bank.docx', 'PLACEHOLDER — DO NOT RUN AUTOMATION'),
        'base': document(tmp_path/'base.docx', 'PLACEHOLDER — DO NOT RUN AUTOMATION'),
    }
    issues = Sources(Drive(files), None).pooja_preflight(tmp_path/'work')
    assert len(issues) == 3
    assert any('Summary Doc' in issue for issue in issues)
    assert any('Master Evidence Bank' in issue for issue in issues)
    assert any('base CV' in issue for issue in issues)


def test_pooja_preflight_accepts_matching_verified_ids(tmp_path, monkeypatch):
    monkeypatch.setenv('POOJA_SUMMARY_DOC_FILE_ID', 'router')
    monkeypatch.setenv('POOJA_MASTER_EVIDENCE_BANK_FILE_ID', 'bank')
    monkeypatch.setenv('POOJA_BASE_CV_FILE_ID', 'base')
    files = {
        'router': document(tmp_path/'router.docx', 'PR-BROKER-MORTGAGE: client work'),
        'bank': document(tmp_path/'bank.docx', 'EVIDENCE_ID: PR-BROKER-MORTGAGE\nVerified client work'),
        'base': document(tmp_path/'base.docx', 'Approved CV template'),
    }
    assert Sources(Drive(files), None).pooja_preflight(tmp_path/'work') == []
