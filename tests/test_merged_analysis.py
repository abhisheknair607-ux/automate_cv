from pathlib import Path
from types import SimpleNamespace

import pytest

from automate_cv.workflow import Workflow
from automate_cv.optimization import combine_analysis_prompts, optimize_formatting_prompt


OUTPUT = '''# JD ANALYSIS
Role and requirements from raw JD.
STAGE1_HANDOFF
```yaml
company: Example
critical_requirement_ids: [R1]
```
# EVIDENCE SELECTION
Ranked verified evidence; genuine gaps retained.
STAGE2_HANDOFF
```yaml
company: Example
cv_structure: High Experience
selected_professional_evidence:
  - key: PR-EY-DOC
selected_projects: []
selected_achievements_qualifications_skills: []
stage3_evidence_to_retrieve_or_verify: []
```
'''


class MemoryDrive:
    def __init__(self): self.files = {}
    def upload(self, path, folder):
        self.files[(folder, Path(path).name)] = Path(path).read_bytes()
    def download_if_exists(self, name, folder, path):
        data = self.files.get((folder, name))
        if data is None: return None
        Path(path).write_bytes(data)
        return path


def setup(tmp_path):
    w = Workflow.__new__(Workflow)
    w.s = SimpleNamespace(stage2_model='gpt-5.6-terra', stage2_reasoning_effort='medium',
                          stage2_max_output_tokens=8000, cost_hard_stop_usd=1.75)
    w.drive = MemoryDrive()
    w.sheet = SimpleNamespace(update=lambda *a: None)
    summary = tmp_path/'router.docx'
    summary.write_bytes(b'router')
    w.sources = SimpleNamespace(stage2=lambda *a: ('candidate-only evidence', summary))
    calls = []
    def text(*args, **kwargs):
        calls.append((args, kwargs))
        return OUTPUT, SimpleNamespace(usage=None, output=[])
    w.ai = SimpleNamespace(text=text)
    w.retry = lambda fn, label: fn()
    app = SimpleNamespace(candidate_key='abhishek', jd_hash='jd-v1', company='Example',
                          designation='Senior', location='Dublin', application_link='job',
                          raw_jd='The complete raw JD')
    return w, app, calls


def test_combined_step_calls_once_and_preserves_both_audits_and_resume(tmp_path):
    w, app, calls = setup(tmp_path)
    manifest, mp = {}, tmp_path/'run_manifest.json'
    result = w._merged_analysis(app, 'first rules', 'second rules', 'folder', tmp_path, manifest, mp)
    assert len(calls) == 1
    assert 'Role and requirements' in result[0]
    assert 'Ranked verified evidence' in result[1]
    assert 'STAGE2_HANDOFF' in result[2]
    assert [x['stage'] for x in manifest['usage_history']] == ['stage1_2']
    assert ('folder', 'stage1_2.md') in w.drive.files
    w._invalidate_from(manifest, 'stage3')
    w._merged_analysis(app, 'first rules', 'second rules', 'folder', tmp_path, manifest, mp)
    assert len(calls) == 1  # Downstream retry does not repay either analysis phase.


def test_changed_jd_or_candidate_source_invalidates_merged_checkpoint(tmp_path):
    w, app, calls = setup(tmp_path)
    manifest, mp = {}, tmp_path/'manifest.json'
    w._merged_analysis(app, 'A', 'B', 'folder', tmp_path, manifest, mp)
    app.jd_hash = 'changed-jd'
    w._merged_analysis(app, 'A', 'B', 'folder', tmp_path, manifest, mp)
    assert len(calls) == 2
    w._merged_analysis(app, 'changed source rules', 'B', 'folder', tmp_path, manifest, mp)
    assert len(calls) == 3


def test_missing_handoff_never_marks_analysis_complete_and_paid_usage_is_saved(tmp_path):
    w, app, calls = setup(tmp_path)
    w.ai.text = lambda *a, **kw: ('No machine handoffs', SimpleNamespace(usage=None, output=[]))
    manifest = {}
    with pytest.raises(RuntimeError, match='STAGE1_HANDOFF'):
        w._merged_analysis(app, 'A', 'B', 'folder', tmp_path, manifest, tmp_path/'manifest.json')
    assert not manifest.get('stage2_complete')
    assert manifest['usage_history'][0]['stage'] == 'stage1_2'


def test_merge_retains_all_substantive_source_text_and_removes_only_transitions():
    a='Candidate-specific safeguard A\n# WORKFLOW HANDOFF — STAGE 1\nold transition'
    b='Candidate-specific selection count B\n# WORKFLOW HANDOFF — STAGE 2\nold transition'
    merged=combine_analysis_prompts(a,b)
    assert 'Candidate-specific safeguard A' in merged
    assert 'Candidate-specific selection count B' in merged
    assert 'old transition' not in merged
    assert 'STAGE1_HANDOFF' in merged and 'STAGE2_HANDOFF' in merged


@pytest.mark.parametrize('candidate', ['pooja','abhishek'])
def test_formatting_replacement_preserves_other_rules_and_allocation(candidate):
    source='PREFACE\n## Formatting Rules\nold formatting\n'+ \
           '### Experience-versus-Projects Allocation Check\nprotected allocation\n'+ \
           '### Core formatting rules\nold measurements\n'+ \
           '# Experience and Project Updating Rules\nALL REMAINING CONTENT RULES'
    result=optimize_formatting_prompt(source,candidate)
    assert result.startswith('PREFACE\n')
    assert result.endswith('# Experience and Project Updating Rules\nALL REMAINING CONTENT RULES')
    assert 'protected allocation' in result
    if candidate == 'pooja':
        assert 'Solve fit through content only' in result
        assert '14 pt' in result and '#1155CC' in result
    else:
        assert '16 pt' in result and '7.481 in' in result


def test_unrecognised_formatting_layout_keeps_original_source_untouched():
    assert optimize_formatting_prompt('unknown source rules','pooja') == 'unknown source rules'
