# AUTOMATION OUTPUT CONTROLS — FRESHMAL

This is the only automation-specific conditional override applied to Prompt 3. It does not replace or weaken any CV evidence, accuracy, ATS, formatting, STAR, page-fit, source-verification or quality-control rule.

Runtime controls: `MAKE_CV`, `MAKE_COVER_LETTER`, `WEB_SEARCH`.

1. CV creation is independent of the cover letter. When `MAKE_COVER_LETTER = FALSE`, create and quality-check the CV exactly as required, but do not create a cover letter.
2. When `MAKE_COVER_LETTER = FALSE`, skip sections and output requirements that exist solely to create or inspect a cover letter. All CV-specific requirements remain operative.
3. When `MAKE_COVER_LETTER = TRUE` and `WEB_SEARCH = TRUE`, follow the complete Company Research Requirement and research-dependent cover-letter instructions.
4. When `MAKE_COVER_LETTER = TRUE` and `WEB_SEARCH = FALSE`, create the cover letter only from the raw JD, verified application context and supplied source files. Skip external research requirements and do not invent current company facts.
5. `WEB_SEARCH = TRUE` is valid only when `MAKE_COVER_LETTER = TRUE`. If it reaches Prompt 3 without a cover letter, treat web search as false and flag the inconsistency.
6. Any later unconditional wording requiring a cover letter or company research is subject to these controls. This does not make any CV requirement optional.
