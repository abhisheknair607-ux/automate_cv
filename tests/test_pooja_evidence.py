import pytest

from automate_cv.pooja_evidence import build_selected_evidence, selected_ids


HANDOFF = '''STAGE2_HANDOFF
cv_structure: High Experience
selected_professional_evidence:
  - key: PR-BROKER-MORTGAGE
selected_projects:
  - id: PROJ-LIFEGOALS
selected_achievements_qualifications_skills:
  - id: QUAL-QFA
exclude_or_interview_only:
  - PR-TP-UNVERIFIED
stage3_evidence_to_retrieve_or_verify:
  - PR-BROKER-MORTGAGE
'''


def test_pooja_extracts_selected_ids_only(tmp_path):
    assert selected_ids(HANDOFF) == ['PR-BROKER-MORTGAGE', 'PROJ-LIFEGOALS', 'QUAL-QFA']
    master = '''EVIDENCE_ID: PR-BROKER-MORTGAGE
Classification: professional experience
Verified mortgage work
EVIDENCE_ID: PROJ-LIFEGOALS
Classification: independent project
Verified project work
EVIDENCE_ID: QUAL-QFA
Qualification: QFA
Verified credential
EVIDENCE_ID: PR-TP-UNVERIFIED
Do not include
'''
    path, ids = build_selected_evidence(master, HANDOFF, tmp_path/'Selected_Evidence.md')
    content = path.read_text()
    assert ids == ['PR-BROKER-MORTGAGE', 'PROJ-LIFEGOALS', 'QUAL-QFA']
    assert 'Verified mortgage work' in content
    assert 'Classification: independent project' in content
    assert 'Do not include' not in content


def test_pooja_missing_evidence_fails_closed(tmp_path):
    with pytest.raises(RuntimeError, match='missing selected IDs'):
        build_selected_evidence('EVIDENCE_ID: QUAL-QFA\nVerified\n', HANDOFF, tmp_path/'out.md')
