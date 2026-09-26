# AUTOMATION OUTPUT CONTROLS — FRESHMAL

This is the only automation-specific conditional override applied to Prompt 3. It does not replace or weaken any CV evidence, accuracy, ATS, formatting, STAR, page-fit, source-verification or quality-control rule.

Runtime controls: `MAKE_CV`, `MAKE_COVER_LETTER`, `WEB_SEARCH`.

1. When `MAKE_CV = TRUE`, create and quality-check the CV exactly as required by Prompt 3.
2. CV creation is independent of the cover letter. When `MAKE_COVER_LETTER = FALSE`, do not create a cover letter and skip sections, outputs and quality checks that exist solely for the cover letter. Record cover-letter-only items as `Not requested` rather than treating them as missing requirements.
3. When `MAKE_COVER_LETTER = TRUE`, create the cover letter exactly as required by Prompt 3, subject to the `WEB_SEARCH` control below.
4. `WEB_SEARCH` is independent of `MAKE_COVER_LETTER`. When `WEB_SEARCH = TRUE`, external web research is permitted and the Company Research Requirement should be executed where relevant to the requested outputs. When `WEB_SEARCH = FALSE`, do not perform external internet research and record research-only output items as `Not requested`.
5. When `MAKE_COVER_LETTER = TRUE` and `WEB_SEARCH = FALSE`, create the cover letter only from the raw JD, verified application context and supplied source files. Do not invent current company facts that require external verification.
6. When `MAKE_COVER_LETTER = FALSE` and `WEB_SEARCH = TRUE`, web research may still be performed and retained in the Stage 3 audit/application context, but no cover letter is created. The CV must remain evidence-led and must not acquire unsupported candidate claims from company research.
7. Any later unconditional wording requiring a cover letter or company research is subject to these controls. This does not make any requested CV requirement optional.
