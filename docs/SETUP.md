# Setup checklist

The code is intentionally disabled until runtime configuration is complete.

Required repository secrets: OpenAI API key plus one supported Google authentication method.

Required repository variables: Freshmal spreadsheet ID, the three authoritative prompt file IDs, output folder ID, Summary Doc ID, CV formatting/base/reference file IDs, and project-folder IDs used for evidence retrieval.

Keep `AUTOMATION_ENABLED=false` during setup. First run a controlled CV-only row. After the output DOCX, Drive folder, Application Context and Freshmal status all look correct, set `AUTOMATION_ENABLED=true` to activate the hourly worker.

Never store API keys or Google credential material in source files, prompt files or Freshmal cells.
