# Level 2 Token/Cost Optimization

## Goal
Reduce recurring API cost while preserving or improving CV/application quality. Do not optimize by deleting context before measuring its contribution.

## Measurements to capture per stage
- input tokens
- cached input tokens
- uncached input tokens
- output tokens
- estimated cost
- retry count
- whether web search was requested
- whether cover letter was requested

## Baseline
Collect a representative sample of completed applications before changing prompt semantics. Compare Stage 1, Stage 2 and Stage 3 separately.

## Safe optimization order
1. Keep stable prompt/source material in a consistent prefix/order to maximize automatic prompt-cache reuse where supported.
2. Avoid API calls when no Freshmal candidate work item is eligible.
3. Do not invoke optional cover-letter or web-search work unless the candidate's control is selected.
4. Identify repeated Stage 3 context that Prompt 3 does not require, using measured cost and prompt requirements; remove only after regression testing.
5. Keep the Summary Doc as source of truth. Consider a structured evidence index only if Stage 2 remains a dominant uncached cost; the index supplements rather than replaces the Summary Doc.
6. Compare output quality on a fixed regression set before accepting any token-saving change.

## Quality regression set
Maintain several representative JDs (e.g. transfer pricing, tax, finance/FP&A, operations finance) and compare before/after outputs for factual accuracy, JD coverage, evidence selection, ATS keywords, structure, one-page QA and absence of invented claims.

## Cost reporting
The workflow should eventually emit a compact per-application report such as:
Stage 1: input X / cached Y / output Z / $A
Stage 2: input X / cached Y / output Z / $B
Stage 3: input X / cached Y / output Z / $C
Total: $T

Only after this instrumentation is live should semantic prompt/context reductions be made.
