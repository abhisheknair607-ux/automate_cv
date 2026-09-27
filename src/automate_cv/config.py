from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = ''

    # Stage-specific model routing. Keep a global fallback for local/backward compatibility.
    openai_model: str = 'gpt-5.6-sol'
    stage1_model: str = 'gpt-5.6-terra'
    stage2_model: str = 'gpt-5.6-terra'
    stage3_model: str = 'gpt-5.6-sol'

    openai_reasoning_effort: str = 'medium'
    stage1_reasoning_effort: str = 'low'
    stage2_reasoning_effort: str = 'medium'
    stage3_reasoning_effort: str = 'medium'

    # Caps are guardrails, not targets. Authoritative Drive prompts set much lower
    # normal output targets; these caps prevent runaway verbose stages.
    stage1_max_output_tokens: int = 6000
    stage2_max_output_tokens: int = 8000
    stage3_max_output_tokens: int = 24000

    # GPT-5.6 prompt caching. Explicit mode is used for stage-specific stable
    # prefixes (Prompt 1; Prompt 2 + compact Summary Router). The JD itself stays
    # in application state and is resent where it is the source of truth.
    prompt_cache_mode: str = 'explicit'
    prompt_cache_ttl: str = '30m'

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
    master_evidence_bank_file_id: str = ''
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
