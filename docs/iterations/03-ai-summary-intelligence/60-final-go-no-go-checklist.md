# Iteration 03 - Final Go/No-Go Checklist

## Decision Scope
Decide whether summaries are ready for mobile exposure.

## Go Conditions
- SummaryPolicy validates.
- Final summaries require citations.
- Structured output validation blocks malformed output.
- Eval harness runs.
- Cost telemetry is attributable.
- Mobile contract for summary/citation/failure is stable.

## Hold Conditions
- Eval corpus is small but sufficient for MVP.
- Additional providers are deferred.

## Rework Conditions
- Uncited final summaries are possible.
- Provider schema leaks into public API.
- Cost cannot be attributed.
- Prompt changes bypass eval.

## Accepted Exceptions
- Advanced personalization can wait.
- Larger eval dataset can grow during beta.

## Critical Audit Evidence
- Schema, citation, prompt-injection, invalid-citation and cost gates are green.
- Summary failure states map to API/mobile/support behavior.
- No final user-visible summary can bypass validation.
- Citation retention/deletion behavior is defined before mobile exposure.
- Summary window boundaries, stale markers and regenerate idempotency are proven with fake-clock fixtures.

## Decision Record
Record decision as `go`, `hold` or `rework` with citation, validation, eval and telemetry evidence.
