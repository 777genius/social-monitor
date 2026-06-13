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
- Closed by PR 39: topic-specific evidence filtering is now supported end to end by the scan queue contract, ingestion feed projection, feed read model and summary evidence selector.

## PR 39 Topic-Scoped Feed Evidence

- `acc4b48 feat: scope feed evidence by topic`

Verified commands:

- `npm run build`
- `npm run check:architecture`
- `git diff --check`

Evidence notes:

- Monitoring scan enqueue commands include the source binding `topicId`; the ingestion worker validates the payload and passes `topicId` into `ExecuteScanUseCase`.
- Feed projection persists `topicId` onto `FeedItem`; feed list/get DTOs expose it and `GET /feed/items?topicId=...` can filter read-model results.
- `FeedSummaryEvidenceSelector` asks the Feed read port for the requested topic only, so summary evidence cannot leak from another topic in the same workspace.
- Feed canonical URL dedupe is tenant/workspace/topic scoped; the same URL can appear once per topic while remaining deduped inside each topic.
