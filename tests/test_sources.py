from automate_cv.sources import (
    build_selected_evidence,
    selected_cv_structure,
    selected_evidence_ids,
)


def handoff(structure='High Experience'):
    return f'''STAGE2_HANDOFF
company: Example
cv_structure: {structure}
selected_professional_evidence:
  - key: PR-EY-FAR
    requirements: [R1]
  - key: PR-EY-DELIVERY
    requirements: [R2]
selected_projects:
  - id: P12
    classification: Individual academic project
selected_achievements_qualifications_skills:
  - ACCA Member
exclude_or_interview_only:
  - PR-EY-GTM
stage3_evidence_to_retrieve_or_verify:
  - FIN-ALPHA
  - PR-EY-FAR
do_not_claim:
  - PR-EY-CONTROVERSY
'''


def test_selected_evidence_ids_use_only_selected_and_verification_sections():
    assert selected_evidence_ids(handoff()) == [
        'PR-EY-FAR',
        'PR-EY-DELIVERY',
        'P12',
        'FIN-ALPHA',
    ]


def test_selected_cv_structure_chooses_exactly_one_reference_family():
    assert selected_cv_structure(handoff('High Experience')) == 'high'
    assert selected_cv_structure(handoff('Lower Experience')) == 'lower'


def test_build_selected_evidence_extracts_exact_blocks_and_not_excluded_ids(tmp_path):
    master = '''CAREER OVERVIEW
Role chronology
EXPERIENCE SCOPE AT A GLANCE
summary
1. Functional analysis, FAR interviews and value-chain assessment
far evidence
2. Economic benchmarking and comparable-company analysis
bench evidence
9. Project delivery, automation and leadership
delivery evidence
FREELANCE ACCOUNTING & TAX SUPPORT
freelance
SELECTED FINANCE, VALUATION AND TRANSACTION PROJECTS
Alpha FMC / Bridgepoint - Independent PE, Credit and FDD Analysis
alpha evidence
Advanced Treasury and Financial Engineering
treasury evidence
Other academic modelling and valuation work
modelling evidence
SELECTED DELIVERABLES PRODUCED
x
EDUCATION, CREDENTIALS AND RECOGNITION
credentials evidence
HOW THIS MASTER DOCUMENT SHOULD BE USED
rules
PART I — PRIORITY 1: AUTHORITATIVE FINAL SUBMISSIONS
1. First project
p1
PART II — PRIORITY 2: GENUINELY ADDITIONAL PROJECTS FROM THE PROJECTS FOLDER
12. Tiger Global — Structured NAV Preferred-Equity Briefing Paper
p12 evidence
13. Next project
p13 evidence
PART III — CONSOLIDATED HARD-SKILL MAP
skills
'''
    target = tmp_path / 'Selected_Evidence.md'
    path, ids = build_selected_evidence(master, handoff(), target)
    text = path.read_text(encoding='utf-8')

    assert ids == ['PR-EY-FAR', 'PR-EY-DELIVERY', 'P12', 'FIN-ALPHA']
    assert 'far evidence' in text
    assert 'delivery evidence' in text
    assert 'p12 evidence' in text
    assert 'alpha evidence' in text
    assert 'credentials evidence' in text
    assert 'PR-EY-GTM' not in text
    assert 'PR-EY-CONTROVERSY' not in text
    assert 'p13 evidence' not in text
