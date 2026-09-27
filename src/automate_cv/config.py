from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    openai_api_key: str = ''
    openai_model: str = 'gpt-5.6-sol'
    openai_reasoning_effort: str = 'medium'
    stage1_reasoning_effort: str = 'medium'
    stage2_reasoning_effort: str = 'medium'
    stage3_reasoning_effort: str = 'medium'
    stage1_max_output_tokens: int = 12000
    stage2_max_output_tokens: int = 16000
    stage3_max_output_tokens: int = 24000
    automation_enabled: bool = False
    google_oauth_client_id: str = ''
    google_oauth_client_secret: str = ''
    google_oauth_refresh_token: str = ''
    google_service_account_json: str = ''
    freshmal_spreadsheet_id: str = ''
    freshmal_sheet_name: str = 'Sheet1'
    prompt1_file_id: str = ''
    prompt2_file_id: str = ''
    prompt3_file_id: str = ''
    drive_output_folder_id: str = ''
    summary_doc_file_id: str = ''
    cv_formatting_master_file_id: str = ''
    base_cv_file_id: str = ''
    high_experience_reference_file_id: str = ''
    lower_experience_reference_file_id: str = ''
    cv_cover_letter_rules_file_id: str = ''
    cover_letter_template_file_id: str = ''
    final_projects_folder_id: str = ''
    projects_folder_id: str = ''
    max_applications_per_run: int = 5
    max_retries: int = 2
    max_row_attempts: int = 3
    stale_lock_minutes: int = 180
    cost_hard_stop_usd: float = 2.0
    workdir: str = '/tmp/automate_cv'
    model_config = SettingsConfigDict(env_file='.env', case_sensitive=False, extra='ignore')

settings = Settings()
