from dataclasses import dataclass
import os


@dataclass(frozen=True)
class CandidateProfile:
    key: str
    display_name: str
    filename_name: str
    folder_name: str
    make_cv_col: int
    make_cl_col: int
    web_search_col: int
    status_col: int
    state_start_col: int
    prompt1_file_id: str
    prompt2_file_id: str
    prompt3_file_id: str
    summary_doc_file_id: str
    base_cv_file_id: str
    formatting_master_file_id: str
    high_experience_reference_file_id: str
    lower_experience_reference_file_id: str
    cv_cover_letter_rules_file_id: str
    cover_letter_template_file_id: str = ''
    final_projects_folder_id: str = ''
    projects_folder_id: str = ''

    def missing_required(self):
        required = {
            'Prompt 1': self.prompt1_file_id,
            'Prompt 2': self.prompt2_file_id,
            'Prompt 3': self.prompt3_file_id,
            'Summary Doc': self.summary_doc_file_id,
            'Base CV': self.base_cv_file_id,
            'CV Formatting Master': self.formatting_master_file_id,
            'CV/Cover Letter Rules': self.cv_cover_letter_rules_file_id,
        }
        return [name for name, value in required.items() if not value]


def _env(name: str, default: str = '') -> str:
    return os.getenv(name, default).strip()


def profiles():
    return {
        'pooja': CandidateProfile(
            key='pooja',
            display_name='Pooja Tirupati',
            filename_name='Pooja_Tirupati',
            folder_name='Pooja',
            make_cv_col=4,
            make_cl_col=5,
            web_search_col=6,
            status_col=10,
            state_start_col=22,
            prompt1_file_id=_env('POOJA_PROMPT1_FILE_ID'),
            prompt2_file_id=_env('POOJA_PROMPT2_FILE_ID'),
            prompt3_file_id=_env('POOJA_PROMPT3_FILE_ID'),
            summary_doc_file_id=_env('POOJA_SUMMARY_DOC_FILE_ID'),
            base_cv_file_id=_env('POOJA_BASE_CV_FILE_ID'),
            formatting_master_file_id=_env('POOJA_CV_FORMATTING_MASTER_FILE_ID'),
            high_experience_reference_file_id=_env('POOJA_HIGH_EXPERIENCE_REFERENCE_FILE_ID'),
            lower_experience_reference_file_id=_env('POOJA_LOWER_EXPERIENCE_REFERENCE_FILE_ID'),
            cv_cover_letter_rules_file_id=_env('POOJA_CV_COVER_LETTER_RULES_FILE_ID'),
            cover_letter_template_file_id=_env('POOJA_COVER_LETTER_TEMPLATE_FILE_ID'),
            final_projects_folder_id=_env('POOJA_FINAL_PROJECTS_FOLDER_ID'),
            projects_folder_id=_env('POOJA_PROJECTS_FOLDER_ID'),
        ),
        'abhishek': CandidateProfile(
            key='abhishek',
            display_name='Abhishek Nair',
            filename_name='Abhishek_Nair',
            folder_name='Abhishek',
            make_cv_col=7,
            make_cl_col=8,
            web_search_col=9,
            status_col=11,
            state_start_col=12,
            prompt1_file_id=_env('PROMPT1_FILE_ID'),
            prompt2_file_id=_env('PROMPT2_FILE_ID'),
            prompt3_file_id=_env('PROMPT3_FILE_ID'),
            summary_doc_file_id=_env('SUMMARY_DOC_FILE_ID'),
            base_cv_file_id=_env('BASE_CV_FILE_ID'),
            formatting_master_file_id=_env('CV_FORMATTING_MASTER_FILE_ID'),
            high_experience_reference_file_id=_env('HIGH_EXPERIENCE_REFERENCE_FILE_ID'),
            lower_experience_reference_file_id=_env('LOWER_EXPERIENCE_REFERENCE_FILE_ID'),
            cv_cover_letter_rules_file_id=_env('CV_COVER_LETTER_RULES_FILE_ID'),
            cover_letter_template_file_id=_env('COVER_LETTER_TEMPLATE_FILE_ID'),
            final_projects_folder_id=_env('FINAL_PROJECTS_FOLDER_ID'),
            projects_folder_id=_env('PROJECTS_FOLDER_ID'),
        ),
    }
