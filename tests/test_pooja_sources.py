import pytest
from automate_cv.sources import build_selected_evidence


def bank():
    records = {
        'CORE-CHRONOLOGY': 'J.P. Nugent July 2026 to current',
        'CORE-CREDENTIALS': 'QFA completed; ACCA 7 of 13',
        'CORE-GUARDRAILS': 'Use current €80.5M rather than historical €50.1M',
        'PR-POOJA-LIFEGOALS': 'Five-person team and roadmap',
        'FIN-POOJA-MORGANS': 'Student consultancy; contribution needs verification',
        'FIN-POOJA-P09': 'Owned CAL and bond valuation',
        'PR-POOJA-SHAREKHAN': 'Unselected trading material',
    }
    return 'CANDIDATE KEY pooja\n' + '\n'.join(
        f'EVIDENCE {key}\n{value}\nEND EVIDENCE {key}' for key, value in records.items()
    )


def handoff():
    return '''STAGE2_HANDOFF
cv_structure: Lower Experience
selected_professional_evidence:
  - key: PR-POOJA-LIFEGOALS
selected_projects:
  - id: FIN-POOJA-MORGANS
selected_achievements_qualifications_skills: []
exclude_or_interview_only:
  - PR-POOJA-SHAREKHAN
stage3_evidence_to_retrieve_or_verify:
  - FIN-POOJA-P09
'''


def test_selected_package_keeps_current_facts_and_contribution_limits(tmp_path):
    path, ids = build_selected_evidence(bank(), handoff(), tmp_path / 'selected.md', candidate_key='pooja')
    result = path.read_text()
    assert ids == ['PR-POOJA-LIFEGOALS', 'FIN-POOJA-MORGANS', 'FIN-POOJA-P09']
    assert 'ACCA 7 of 13' in result
    assert 'current €80.5M' in result
    assert 'Student consultancy' in result
    assert 'Owned CAL and bond valuation' in result
    assert 'Unselected trading material' not in result


@pytest.mark.parametrize('candidate,key', [('pooja', 'PR-EY-FAR'), ('abhishek', 'PR-POOJA-LIFEGOALS')])
def test_candidate_bank_and_handoff_isolation(tmp_path, candidate, key):
    text = handoff().replace('PR-POOJA-LIFEGOALS', key)
    with pytest.raises(RuntimeError, match='another candidate|Candidate mismatch'):
        build_selected_evidence(bank(), text, tmp_path / 'selected.md', candidate_key=candidate)


def test_missing_or_duplicate_record_fails_closed(tmp_path):
    for text in (bank().replace('END EVIDENCE FIN-POOJA-MORGANS', 'MISSING'),
                 bank() + '\nEVIDENCE FIN-POOJA-MORGANS\nduplicate'):
        with pytest.raises(RuntimeError):
            build_selected_evidence(text, handoff(), tmp_path / 'selected.md', candidate_key='pooja')


def test_requires_candidate_owned_bank(tmp_path):
    with pytest.raises(RuntimeError, match='candidate-owned'):
        build_selected_evidence('CAREER OVERVIEW\nlegacy', handoff(), tmp_path / 'selected.md', candidate_key='pooja')
