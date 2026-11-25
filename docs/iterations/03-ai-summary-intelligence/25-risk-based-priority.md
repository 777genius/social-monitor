# Iteration 03 - Risk-Based Priority

## Priority 1 - Evidence And Citation Model

- Risk: Summaries become untrusted and unauditable.
- Do First: Link summary claims to normalized feed items.
- Do Not Defer: Citation validation.

## Priority 2 - Structured Output Validation

- Risk: Provider output breaks UI or corrupts stored summaries.
- Do First: Validate schema before persistence.
- Do Not Defer: Malformed output handling.

## Priority 3 - Cost Telemetry

- Risk: AI cost becomes unpredictable.
- Do First: Track tokens/cost per summary job.
- Do Not Defer: Tenant/topic budget visibility.

## Priority 4 - Eval Harness

- Risk: Prompt/model changes silently regress quality.
- Do First: Golden examples and regression command.
