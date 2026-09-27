from pathlib import Path
from docx import Document

from automate_cv.qa import factual_report, normalize


def make_doc(path, text):
    doc = Document()
    doc.add_paragraph(text)
    doc.save(path)
    return Path(path)


def test_normalize_prefers_identifiable_cv_and_cover_letter(tmp_path):
    generic = make_doc(tmp_path / 'artifact.docx', 'generic')
    cv = make_doc(tmp_path / 'candidate_CV.docx', 'cv')
    cl = make_doc(tmp_path / 'candidate_Cover_Letter.docx', 'cover')
    out = tmp_path / 'out'
    final_cv, final_cl = normalize([generic, cl, cv], 'Final_CV.docx', 'Final_CL.docx', out)
    assert final_cv.read_bytes() == cv.read_bytes()
    assert final_cl.read_bytes() == cl.read_bytes()


def test_factual_report_accepts_supported_high_risk_claims(tmp_path):
    cv = make_doc(
        tmp_path / 'cv.docx',
        'ACCA Member. Power BI. Improved accuracy by 20%. Managed €1.5m. '
        'Worked with 12 clients. June 2026 - Present. CGPA 9.26/10.',
    )
    source = (
        'Verified: ACCA Member; Power BI; 20% improvement; managed €1.5 million; '
        '12 clients; June 2026 - Present; CGPA 9.26/10.'
    )
    result = factual_report(cv, source, tmp_path / 'qa.md')
    assert result['critical'] == []


def test_factual_report_blocks_unsupported_percentage_tool_and_qualification(tmp_path):
    cv = make_doc(tmp_path / 'cv.docx', 'CFA candidate. Tableau. Increased revenue by 37%.')
    source = 'Verified evidence contains Excel and ACCA only.'
    result = factual_report(cv, source, tmp_path / 'qa.md')
    joined = ' '.join(result['critical'])
    assert '37%' in joined
    assert 'Tableau' in joined
    assert 'CFA' in joined


def test_factual_report_blocks_unsupported_date_and_count(tmp_path):
    cv = make_doc(tmp_path / 'cv.docx', 'Senior Analyst, July 2025 - June 2026. Managed 18 clients.')
    source = 'Senior Analyst, July 2025 - May 2026. Managed 12 clients.'
    result = factual_report(cv, source, tmp_path / 'qa.md')
    joined = ' '.join(result['critical'])
    assert '2026-06' in joined
    assert '18 client' in joined


def test_factual_report_blocks_unsupported_exam_progress(tmp_path):
    cv = make_doc(tmp_path / 'cv.docx', 'ACCA: 9 of 13 exams passed.')
    source = 'ACCA student: 8 of 13 exams passed.'
    result = factual_report(cv, source, tmp_path / 'qa.md')
    joined = ' '.join(result['critical'])
    assert '9 of 13' in joined
