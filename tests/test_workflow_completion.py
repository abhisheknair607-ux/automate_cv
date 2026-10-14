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
@pytest.mark.parametrize('make_cl', [False, True])
@pytest.mark.parametrize('candidate', ['abhishek', 'pooja'])
def test_both_analysis_routes_finalize_and_resume_without_new_paid_calls(tmp_path, monkeypatch, merged, make_cl, candidate):
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
    generated_cl = tmp_path/'Generated_Cover_Letter.docx'
    doc.save(generated_cl)

    def analysis(*args, **kwargs):
        calls.append('analysis')
        return OUTPUT, response

    def generation(*args, **kwargs):
        if 'MAKE_CV = FALSE' in args[1]:
            assert kwargs['model'] == 'gpt-6.1-sol'
            assert 'COVER LETTER VOICE AND STORY' in args[0]
            assert f'For {candidate.title()}' in args[0]
            assert f'For {"Pooja" if candidate == "abhishek" else "Abhishek"}' not in args[0]
            assert 'MAKE_CV = FALSE\nMAKE_COVER_LETTER = TRUE\n' in args[1]
            calls.append('cover_letter')
            return 'Cover letter written', response, [generated_cl]
        assert 'MAKE_COVER_LETTER = TRUE' not in args[1]
        assert 'PROFESSIONAL PROFILE VOICE' in args[0]
        assert f'For {candidate.title()}' in args[0]
        calls.append('generation')
        return 'ATS Match Score: 80/100', response, [generated]

    w = Workflow(settings, sheet, drive,
        SimpleNamespace(text=analysis, stage3=generation),
        SimpleNamespace(read=lambda *args: 'authoritative source rules'))
    w.profiles = {candidate: SimpleNamespace(missing_required=lambda: [])}
    w.sources = SimpleNamespace(stage2=lambda *args: ('verified router', source),
        master_evidence=lambda *args: ('verified master', source),
        stage3=lambda *args, **kwargs: [source])

    def normalize(artifacts, cv_name, cl_name, out):
        cv = out/cv_name
        cv.write_bytes(generated.read_bytes())
        if cl_name:
            cl = out/cl_name
            cl.write_bytes(generated_cl.read_bytes())
            return cv, cl
        return cv, None

    def factual_report(cv, master, out):
        out.write_text('No critical factual issues.')
        return {'critical': []}

    monkeypatch.setattr('automate_cv.workflow.normalize', normalize)
    monkeypatch.setattr('automate_cv.workflow.one_page', lambda *args: None)
    monkeypatch.setattr('automate_cv.workflow.factual_report', factual_report)
    app = ApplicationRow(20, 'Kroll', 'Senior Associate', 'https://job.test',
        'raw JD', True, make_cl, False, '', application_id='test-row', jd_hash='jd-v1',
        candidate_key=candidate, model_tier='Economy', cl_model_tier='Balanced')

    w.run(app)
    assert not failed
    assert len(completed) == 1
    manifest = json.loads(next(v for (folder, name), v in drive.files.items()
                               if name == 'run_manifest.json'))
    assert manifest['complete'] is True
    assert manifest['summary_hash'] == _hash('verified router')
    assert manifest['context_link'] and manifest['cv_link']
    if make_cl:
        assert manifest['cl_link'] and manifest['cl_model_tier'] == 'Balanced'
        assert manifest['latest_stage_usage']['cover_letter']['cover_letter_tier'] == 'Balanced'
    expected = ['analysis', 'generation'] if merged else ['analysis', 'analysis', 'generation']
    if make_cl:
        expected.append('cover_letter')
    assert calls == expected
    before = list(calls)
    w.run(app)
    assert calls == before
    assert len(completed) == 2
    assert not failed
