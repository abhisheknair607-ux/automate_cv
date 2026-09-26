from pathlib import Path
from docx import Document

def docx_text(path):
    doc=Document(path)
    parts=[p.text for p in doc.paragraphs if p.text]
    for table in doc.tables:
        for row in table.rows:
            parts.append(' | '.join(cell.text for cell in row.cells))
    return '\n'.join(parts)

class Sources:
    def __init__(self,drive,settings):
        self.drive=drive
        self.settings=settings

    def stage2(self,workdir):
        if not self.settings.summary_doc_file_id:
            raise RuntimeError('SUMMARY_DOC_FILE_ID missing.')
        path=self.drive.download_named(self.settings.summary_doc_file_id,workdir)
        return docx_text(path),path

    def stage3(self,workdir,summary_path):
        paths=[summary_path]
        ids=[self.settings.cv_formatting_master_file_id,self.settings.base_cv_file_id,self.settings.high_experience_reference_file_id,self.settings.lower_experience_reference_file_id,self.settings.cv_cover_letter_rules_file_id,self.settings.cover_letter_template_file_id]
        for file_id in ids:
            if file_id:
                path=self.drive.download_named(file_id,workdir)
                if path not in paths: paths.append(path)
        return paths
