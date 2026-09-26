from pathlib import Path
from docx import Document

def cv_text(path):
    d=Document(path); parts=[p.text for p in d.paragraphs if p.text]
    for table in d.tables:
        for row in table.rows: parts.append(' | '.join(c.text for c in row.cells))
    return '\n'.join(parts)

def write_context(path,app,stage1,stage2,stage3,cv_path,cv_link):
    text=f'''# Application Context — {app.company} — {app.designation}\n\nApplication ID: {app.application_id}\nVacancy: {app.application_link}\nCurrent CV: {cv_link}\n\n## Continuation instruction\nContinue from the current CV and verified application context. Do not restart Stages 1–3 unless explicitly requested. Do not invent experience, metrics, qualifications, responsibilities or ownership.\n\n## Raw Job Description\n{app.raw_jd}\n\n## Stage 1\n{stage1}\n\n## Stage 2\n{stage2}\n\n## Stage 3 / QA notes\n{stage3}\n\n## Current CV Text\n{cv_text(cv_path)}\n'''
    path=Path(path); path.write_text(text,encoding='utf-8'); return path
