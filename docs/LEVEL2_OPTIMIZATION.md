# Level 2 Token/Cost Optimization

## Goal
Reduce recurring API cost while preserving or improving CV/application quality. Do not optimize by deleting context before measuring its contribution.

## Implemented instrumentation
Every paid Stage 1/2/3 response records:
- input tokens
- cached input tokens
- uncached input tokens
- output tokens
- reasoning tokens when reported by the API
- estimated stage cost
- timestamp / GitHub run ID in manifest usage history

`run_manifest.json` retains cumulative cost/history across retries and `Token_Usage.json` exposes the application-level audit after completion.

The cost hard stop is evaluated after every paid stage, not only after Stage 3.

## Implemented safe efficiency changes
1. Stage 2 places stable candidate Summary Doc content before changing JD/Stage 1 material to improve cache eligibility.
2. The hourly runner makes no OpenAI workflow call when no candidate work item is eligible.
3. Cover Letter and Web Search remain independent and are invoked only when selected for that candidate.
4. Stage-specific reasoning effort is configurable; initial defaults remain `medium` to protect quality.
5. Stage-specific max-output-token caps prevent unexpected unbounded responses.
6. Stage 1/2 Drive checkpoints prevent paying for completed upstream stages again after a downstream retry when hashes still match.
7. Candidate work is grouped by candidate in an hourly batch so repeated candidate-specific prefixes remain adjacent where possible.

## Baseline / next measurement step
Collect a representative sample of completed applications before reducing reasoning effort or removing Stage 3 context. Compare Stage 1, Stage 2 and Stage 3 separately.

Recommended initial regression set:
- transfer pricing;
- tax;
- finance / FP&A;
- operations finance.

For each before/after change, compare factual accuracy, JD coverage, evidence selection, ATS terminology, structure, page-fit and absence of invented claims.

## Deliberately not implemented yet
These are future optimizations and require measured evidence first:
- compacting Stage 1/2 handoffs;
- removing Summary Doc evidence from any stage that currently depends on it;
- choosing only one reference CV automatically;
- lowering reasoning effort;
- switching Stage 1 to a cheaper model;
- Phase F deterministic JSON-to-DOCX rendering.

The Summary Doc remains the consolidated factual source of truth. A structured evidence index, if later added, supplements rather than replaces it.

## Evaluation format
After real runs, use the captured telemetry to compare approximately:

```text
Stage 1: input / cached / uncached / output / reasoning / cost
Stage 2: input / cached / uncached / output / reasoning / cost
Stage 3: input / cached / uncached / output / reasoning / cost
Cumulative application cost
```

Only optimize the dominant measured cost where regression tests show quality is preserved.
