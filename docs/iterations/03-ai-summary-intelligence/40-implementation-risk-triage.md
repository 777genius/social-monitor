# Iteration 03 - Implementation Risk Triage

## Triage Goal
Detect AI and summary risks before users see uncited, unvalidated or too-expensive output.

## Critical Risks
- Final summaries contain uncited claims.
- Provider output is persisted without validation.
- Prompt/model changes have no eval path.
- Cost telemetry is missing or incomplete.

## Early Warning Signals
- Summary quality is judged only manually.
- Citations reference text, not stable feed IDs.
- Provider SDK types appear in domain/application code.
- Token/cost data is unavailable in logs or metrics.

## Owners
- AI lead owns evals, policy and provider port.
- Backend lead owns summary API and persistence.
- Product owner owns user-facing summary formats.
- Operations owner owns cost telemetry.

## Mitigations
- Reject invalid structured output.
- Require citation validation before final status.
- Run prompt/model changes through golden evals.
- Record model, usage, latency and cost metadata.

## Stop-Work Triggers
- Uncited summary can become final.
- Provider-specific response shape leaks into public API.
- Cost cannot be attributed to tenant/topic/summary job.

## MVP Risk Cutline
- Fix now: schema validation, citations, eval gate, cost attribution and provider isolation.
- Carry with owner: larger eval dataset and prompt style improvements.
- Defer: multi-agent workflows, fine-tuning and complex personalization.
