# Iteration 03 - Developer Execution Playbook

## Reading Order
1. Read `01-summary-domain-contract.md`.
2. Read `35-first-sprint-ticket-cut.md`.
3. Read `38-architecture-compliance-audit.md`.
4. Read `39-contract-dependency-checklist.md`.
5. Read `41-test-fixtures-and-scenarios.md`.

## PR Slicing
- PR 1: SummaryPolicy model and validation.
- PR 2: evidence and citation model.
- PR 3: AiSummarizerPort.
- PR 4: structured output validation.
- PR 5: eval harness and golden dataset.
- PR 6: summary API/status events.

## Checks Before PR
- Final summaries require valid citations.
- Provider output is schema and business validated.
- AI provider details do not leak into domain.
- Cost telemetry is recorded.
- Prompt/model changes have eval evidence.

## Evidence To Attach
- Structured output validation result.
- Citation trace from summary claim to feed item.
- Eval/golden dataset result for prompt or policy changes.
- Cost/token telemetry sample.
- Provider failure scenario if adapter behavior changes.

## Architecture Guardrails
- AI output is external input, not trusted domain data.
- Policy, evidence selection and provider calls stay separate.
- Citation validation is centralized.

## Escalate When
- A summary can be useful but uncited.
- A model requires provider-specific public API fields.
- Cost cannot be attributed to tenant/topic/job.
