from pathlib import Path

from docx import Document

from .profiles import profiles


def docx_text(path):
    doc = Document(path)
    parts = [p.text for p in doc.paragraphs if p.text]
    for table in doc.tables:
        for row in table.rows:
            parts.append(' | '.join(cell.text for cell in row.cells))
    return '\n'.join(parts)


def mentioned_files(text):
    endings = ('.docx', '.doc', '.pdf', '.xlsx', '.xls', '.md', '.txt')
    found = []
    for raw in text.replace('`', ' ').replace('“', ' ').replace('”', ' ').splitlines():
        line = raw.strip().strip('* -')
        for ending in endings:
            pos = line.lower().find(ending)
            if pos >= 0:
                candidate = line[: pos + len(ending)].split(':')[-1].strip(' "')
                if candidate and candidate not in found:
                    found.append(candidate)
    return found


class Sources:
    def __init__(self, drive, settings):
        self.drive = drive
        self.settings = settings
        self.profiles = profiles()

    def stage2(self, candidate_key, workdir):
        """Load only the compact Summary Doc / Evidence Router for Stage 2."""
        p = self.profiles[candidate_key]
        if not p.summary_doc_file_id:
            raise RuntimeError(f'{candidate_key}: SUMMARY_DOC_FILE_ID missing.')
        path = self.drive.download_named(p.summary_doc_file_id, workdir)
        return docx_text(path), path

    def master_evidence(self, candidate_key, workdir):
        """Load the detailed factual bank for Stage 3 verification and final QA."""
        p = self.profiles[candidate_key]
        if not p.master_evidence_bank_file_id:
            raise RuntimeError(f'{candidate_key}: MASTER_EVIDENCE_BANK_FILE_ID missing.')
        path = self.drive.download_named(p.master_evidence_bank_file_id, workdir)
        return docx_text(path), path

    def stage3(self, candidate_key, workdir, summary_path, master_path, stage2_output):
        p = self.profiles[candidate_key]
        # The compact router and detailed bank are mounted as files for selective
        # Python-tool verification. Their full text is not copied into the model prompt.
        paths = [summary_path, master_path]
        ids = [
            p.formatting_master_file_id,
            p.base_cv_file_id,
            p.high_experience_reference_file_id,
            p.lower_experience_reference_file_id,
            p.cv_cover_letter_rules_file_id,
            p.cover_letter_template_file_id,
        ]
        for file_id in ids:
            if file_id:
                path = self.drive.download_named(file_id, workdir)
                if path not in paths:
                    paths.append(path)

        candidate_project_folders = [p.final_projects_folder_id, p.projects_folder_id]
        for name in mentioned_files(stage2_output):
            item = self.drive.find(name, candidate_project_folders)
            if item:
                path = self.drive.download_named(item['id'], workdir)
                if path not in paths:
                    paths.append(path)
        return paths
