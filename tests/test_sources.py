import shutil
from types import SimpleNamespace

from docx import Document

from automate_cv.sources import (
    Sources,
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
do_not_claim:
  - PR-EY-CONTROVERSY
stage3_evidence_to_retrieve_or_verify:
  - FIN-ALPHA
  - PR-EY-FAR
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


class FakeDrive:
    def __init__(self, files):
        self.files = files

    def download_named(self, file_id, directory):
        source = self.files[file_id]
        target = directory / source.name
        shutil.copy2(source, target)
        return target

    def find(self, name, folders):
        return None


def _write_master(path):
    doc = Document()
    for line in (
        'CAREER OVERVIEW',
        'EY | Analyst | Mumbai | Jun 2022 - Jul 2025',
        'EXPERIENCE SCOPE AT A GLANCE',
        'scope',
        '1. Functional analysis, FAR interviews and value-chain assessment',
        'far evidence',
        '2. Economic benchmarking and comparable-company analysis',
        'bench evidence',
        'EDUCATION, CREDENTIALS AND RECOGNITION',
        'ACCA Member',
        'HOW THIS MASTER DOCUMENT SHOULD BE USED',
        'rules',
    ):
        doc.add_paragraph(line)
    doc.save(path)


def _minimal_stage3_handoff(structure='High Experience'):
    return f'''STAGE2_HANDOFF
cv_structure: {structure}
selected_professional_evidence:
  - key: PR-EY-FAR
selected_projects: []
selected_achievements_qualifications_skills: []
do_not_claim: []
stage3_evidence_to_retrieve_or_verify: []
'''


def test_stage3_omits_cv_cl_rules_for_cv_only_and_uses_one_reference(tmp_path):
    master = tmp_path / 'MASTER EVIDENCE BANK.docx'
    _write_master(master)
    files = {}
    for file_id, name in (
        ('fmt', 'CV Formatting & Structure Master.docx'),
        ('base', 'Base CV.docx'),
        ('high', 'High Experience Reference.docx'),
        ('low', 'Lower Experience Reference.docx'),
        ('rules', 'CV & Cover letter.docx'),
        ('cl', 'Cover Letter Template.docx'),
    ):
        path = tmp_path / f'src-{name}'
        path.write_bytes(file_id.encode())
        files[file_id] = path

    sources = Sources(FakeDrive(files), None)
    sources.profiles = {
        'abhishek': SimpleNamespace(
            formatting_master_file_id='fmt',
            base_cv_file_id='base',
            high_experience_reference_file_id='high',
            lower_experience_reference_file_id='low',
            cv_cover_letter_rules_file_id='rules',
            cover_letter_template_file_id='cl',
            final_projects_folder_id='',
            projects_folder_id='',
        )
    }
    work = tmp_path / 'work'
    work.mkdir()
    paths = sources.stage3(
        'abhishek',
        work,
        tmp_path / 'summary.docx',
        master,
        _minimal_stage3_handoff(),
        make_cover_letter=False,
    )
    names = {p.name for p in paths}
    assert 'Selected_Evidence.md' in names
    assert 'High Experience Reference.docx' in names
    assert 'Lower Experience Reference.docx' not in names
    assert 'CV & Cover letter.docx' not in names
    assert 'Cover Letter Template.docx' not in names
    assert 'MASTER EVIDENCE BANK.docx' not in names
    assert 'summary.docx' not in names


def test_stage3_includes_cv_cl_rules_only_when_cover_letter_is_requested(tmp_path):
    master = tmp_path / 'MASTER EVIDENCE BANK.docx'
    _write_master(master)
    files = {}
    for file_id, name in (
        ('fmt', 'CV Formatting & Structure Master.docx'),
        ('base', 'Base CV.docx'),
        ('high', 'High Experience Reference.docx'),
        ('low', 'Lower Experience Reference.docx'),
        ('rules', 'CV & Cover letter.docx'),
        ('cl', 'Cover Letter Template.docx'),
    ):
        path = tmp_path / f'src-{name}'
        path.write_bytes(file_id.encode())
        files[file_id] = path

    sources = Sources(FakeDrive(files), None)
    sources.profiles = {
        'abhishek': SimpleNamespace(
            formatting_master_file_id='fmt',
            base_cv_file_id='base',
            high_experience_reference_file_id='high',
            lower_experience_reference_file_id='low',
            cv_cover_letter_rules_file_id='rules',
            cover_letter_template_file_id='cl',
            final_projects_folder_id='',
            projects_folder_id='',
        )
    }
    work = tmp_path / 'work'
    work.mkdir()
    paths = sources.stage3(
        'abhishek',
        work,
        tmp_path / 'summary.docx',
        master,
        _minimal_stage3_handoff('Lower Experience'),
        make_cover_letter=True,
    )
    names = {p.name for p in paths}
    assert 'Lower Experience Reference.docx' in names
    assert 'High Experience Reference.docx' not in names
    assert 'CV & Cover letter.docx' in names
    assert 'Cover Letter Template.docx' in names
