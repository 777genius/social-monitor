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

## PR 38 Feed-Backed Summary Evidence Selection

- `5116ac8 feat: select summary evidence from feed`

Verified commands:

- `npm run build`
- `npm run check:summary-evidence-smoke`
- `npm run check:architecture`
- `npm run check:code-quality`
- `git diff --check`

Evidence notes:

- `FeedSummaryEvidenceSelector` maps tenant/workspace feed items into `SummaryEvidenceItem` records with feed id, source item id, source binding id, title, body preview, canonical URL and observed timestamp.
- Summary runtime wiring now depends on `FeedItemReadRepositoryPort` through the exported `FEED_ITEM_READ_REPOSITORY` token; no Summary feature imports Feed adapters.
- The smoke check proves an evidence-backed summary job completes with a citation-backed key point instead of `no_signal`, persists the artifact and emits one `summary.ready` event.
- MVP residual risk: feed items currently do not carry `topicId`, so the selector uses latest tenant/workspace feed items for the requested topic window. Topic-specific evidence filtering remains a follow-up read-model/port slice.
