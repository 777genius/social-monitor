# Iteration 03 - Traceable Evidence Register

## Evidence Goal
Prove that summaries are cited, validated, evaluated and cost-aware.

## Critical Audit Evidence
- Final summaries cannot complete without schema and citation validation.
- Prompt-injection and invalid-citation fixtures block promotion.
- Cost preflight and usage telemetry exist before provider execution.
- Feedback can become eval fixture without mutating completed artifact text.
- Citation retention/unavailable behavior is proven when raw/source evidence is deleted or hidden.
- Summary window fixtures prove UTC boundaries, frozen evidence, stale marking and regenerate idempotency.

## Decision Evidence
- Citation requirement decision.
- AI provider port decision.
- Structured output validation decision.
- Eval harness decision.
- Cost telemetry decision.

## Ticket Evidence
- SummaryPolicy tickets link to validation tests.
- Citation tickets link to positive and negative examples.
- Provider-port tickets link to adapter boundaries.
- Eval tickets link to golden dataset output.

## Review Evidence
- PR rubric confirms no uncited final summary.
- Mobile lead accepts citation contract.
- Operations owner accepts cost telemetry sample.

## Handoff Evidence
- Mobile iteration accepts summary/citation/failure contracts.
- Residual summary quality risks are owned.

## Missing Evidence Blocks
- Missing citation validation.
- Missing eval output.
- Missing cost attribution.
- Missing temporal window evidence for summary selection and stale marking.
