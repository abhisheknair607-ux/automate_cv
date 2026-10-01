"""Exercise generation through final audit/Sheet completion for both routes."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from docx import Document

from automate_cv.config import Settings
from automate_cv.models import ApplicationRow
from automate_cv.workflow import Workflow, _hash
from test_merged_analysis import OUTPUT


class MemoryDrive:
    def __init__(self):
        self.files = {}

    def folder(self, name, parent):
        key = f'{parent}/{name}'
        return key, f'https://drive.test/{key}'

    def upload(self, path, folder):
        path = Path(path)
        self.files[(folder, path.name)] = path.read_bytes()
        return path.name, f'https://drive.test/{folder}/{path.name}'

    def download_if_exists(self, name, folder, path):
        data = self.files.get((folder, name))
        if data is None:
            return None
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(data)
        return path

    def find(self, name, folders):
        for folder in folders:
            if (folder, name) in self.files:
                return {'webViewLink': f'https://drive.test/{folder}/{name}'}
        return None


@pytest.mark.parametrize('merged', [True, False])
def test_both_analysis_routes_finalize_and_resume_without_new_paid_calls(tmp_path, monkeypatch, merged):
    completed, failed, calls = [], [], []
    sheet = SimpleNamespace(prepare=lambda app: True, claim=lambda app: None,
        update=lambda *args: None, done=lambda *args, **kwargs: completed.append(args),
        fail=lambda *args: failed.append(args))
    settings = Settings(_env_file=None, merged_analysis=merged, workdir=str(tmp_path/'work'))
    drive = MemoryDrive()
    response = SimpleNamespace(usage=None, output=[])
    source = tmp_path/'router.docx'
    source.write_bytes(b'router source')
    generated = tmp_path/'generated.docx'
    doc = Document()
    doc.add_paragraph('Supported candidate evidence.')
    doc.save(generated)

    def analysis(*args, **kwargs):
        calls.append('analysis')
        return OUTPUT, response

    def generation(*args, **kwargs):
        calls.append('generation')
        return 'ATS Match Score: 80/100', response, [generated]

    w = Workflow(settings, sheet, drive,
        SimpleNamespace(text=analysis, stage3=generation),
        SimpleNamespace(read=lambda *args: 'authoritative source rules'))
    w.profiles = {'abhishek': SimpleNamespace(missing_required=lambda: [])}
    w.sources = SimpleNamespace(stage2=lambda *args: ('verified router', source),
        master_evidence=lambda *args: ('verified master', source),
        stage3=lambda *args, **kwargs: [source])

    def normalize(artifacts, cv_name, cl_name, out):
        cv = out/cv_name
        cv.write_bytes(generated.read_bytes())
        return cv, None

    def factual_report(cv, master, out):
        out.write_text('No critical factual issues.')
        return {'critical': []}

    monkeypatch.setattr('automate_cv.workflow.normalize', normalize)
    monkeypatch.setattr('automate_cv.workflow.one_page', lambda *args: None)
    monkeypatch.setattr('automate_cv.workflow.factual_report', factual_report)
    app = ApplicationRow(20, 'Kroll', 'Senior Associate', 'https://job.test',
        'raw JD', True, False, False, '', application_id='test-row', jd_hash='jd-v1')

    w.run(app)
    assert not failed
    assert len(completed) == 1
    manifest = json.loads(next(v for (folder, name), v in drive.files.items()
                               if name == 'run_manifest.json'))
    assert manifest['complete'] is True
    assert manifest['summary_hash'] == _hash('verified router')
    assert manifest['context_link'] and manifest['cv_link']
    assert calls == (['analysis', 'generation'] if merged else ['analysis', 'analysis', 'generation'])
    before = list(calls)
    w.run(app)
    assert calls == before
    assert len(completed) == 2
    assert not failed
