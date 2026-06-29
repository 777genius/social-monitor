# Iteration 03 / Phase 01 - Summary Domain Contract

## Objective

Define summary as a structured domain artifact, not free-form AI text.

## Steps

1. Define summary schema v1.
2. Define citation model referencing source item ids.
3. Define summary rules per topic: style, length, focus, excluded terms.
4. Define source window and candidate selection.
5. Define summary states: requested, running, completed, failed, review_required.
6. Add REST endpoints for request/list/detail.
7. Define claim-level citation requirement for key points, risks and recommendations.
8. Define summary lineage: topic rules version, source window, prompt version, schema version, model/provider version and eval set version.
9. Define stale-summary semantics when new feed items arrive after summary generation.

## Summary State Machine

| State | Meaning | Allowed Next States |
| --- | --- | --- |
| `requested` | command accepted and idempotency recorded | `selecting_evidence`, `failed` |
| `selecting_evidence` | feed window is being frozen and ranked | `running`, `no_signal`, `failed` |
| `running` | model/provider attempt is in progress | `validating`, `failed` |
| `validating` | schema, citation and policy checks are running | `completed`, `review_required`, `failed` |
| `completed` | artifact is safe for normal display | `stale`, `superseded` |
| `no_signal` | valid artifact says no useful signal exists | `stale`, `superseded` |
| `review_required` | artifact exists but needs special UI/support handling | `completed`, `failed`, `superseded` |
| `failed` | no displayable artifact was produced | `requested` by regenerate |
| `stale` | new evidence arrived after source window | `superseded` by regenerate |
| `superseded` | replaced by a newer summary | terminal |

Transition rules:

1. `completed` requires schema validation, citation validation and tenant/topic evidence validation.
2. `no_signal` is a valid terminal user-facing state, not a failure.
3. `review_required` is used for low confidence, conflicting evidence or policy-sensitive output.
4. `stale` does not mutate the original text; it adds a freshness state and points to newer feed evidence.
5. Regenerate creates a new request/artifact lineage instead of editing the old artifact in place.

## Evidence Window Rules

1. Freeze input window by tenant, workspace, topic, feed item ids, source item ids and observed timestamps before model execution.
2. Store window hash and selection policy version.
3. Do not include items whose source binding disallows AI summarization.
4. Do not include hidden/deleted/unavailable items unless the summary explicitly discusses unavailability and still cites retained evidence.
5. Enforce source diversity when enough items exist; otherwise record `limited_sources`.
6. If feed items change during model execution, validate against frozen evidence and mark freshness separately.
7. Citation ids must reference the frozen evidence window.

## Summary Window Time Rules

1. Store summary window boundaries as UTC instants with inclusive start and exclusive end.
2. Keep `providerPublishedAt`, `observedAt`, `ingestedAt`, `selectedAt`, `summaryRequestedAt`, `summaryCompletedAt` and `staleMarkedAt` as separate concepts.
3. Select evidence by feed/read-model policy, not by provider timestamp alone.
4. Provider future timestamps are allowed as source metadata but cannot expand the summary window unless the source policy explicitly permits it.
5. If evidence arrives after `selectedAt` but before completion, keep validating against the frozen window and mark freshness separately.
6. Regeneration creates a new window id/hash; it does not mutate the old artifact.
7. Window hash must be stable under retry and include topic rules version, selection policy version and selected item ids.
8. Fake-clock fixtures must prove boundary behavior, stale marking and regenerate idempotency.

## Citation Retention Rules

1. A summary citation references retained safe provenance, not raw provider payload as the only evidence.
2. If raw source body is deleted but normalized citation fields remain, citation can stay visible with limited detail.
3. If source/feed item is deleted or hidden by policy, summary shows `citation_unavailable` or becomes stale/review-required according to policy.
4. Regeneration after deletion uses current available evidence and creates a new lineage.
5. Feedback about missing/deleted citations is stored separately and can become eval/support evidence.

## Summary Schema V1 Fields

Required top-level fields:

- `schemaVersion`
- `summaryId`
- `tenantId`
- `workspaceId`
- `interestId`
- `sourceWindow`
- `headline`
- `executiveSummary`
- `keyPoints`
- `risksAndUnknowns`
- `sourceHighlights`
- `citationMap`
- `qualityFlags`
- `lineage`
- `usage`

Business validation:

1. `keyPoints[].claim` requires `citationIds`.
2. `risksAndUnknowns[]` may cite evidence or use `reason: insufficient_evidence`.
3. `sourceHighlights[]` must reference source/feed ids and provider/source display labels.
4. `qualityFlags` must include `no_signal` when `keyPoints` is empty.
5. `lineage` must include prompt, schema, model, provider, rules and eval dataset versions.
6. `usage` must include token/cost estimate even for failed provider attempts where available.

## Summary Artifact Invariants

Every completed summary must include:

- Tenant/workspace/topic scope.
- Source window boundaries.
- Summary policy/rules version.
- Prompt template version.
- Structured output schema version.
- Model/provider metadata.
- Citation list with source item ids and quote/field references where available.
- Confidence/quality flags.
- Cost/token metadata.
- Created-by trigger: scheduled, manual, regenerate or system retry.

Do not persist a summary as `completed` if key claims lack citations, output fails schema validation or evidence no longer belongs to the same tenant/topic.

## Feedback Taxonomy

Feedback is stored as evidence for future evals, not as direct mutation of the original summary.

Supported MVP labels:

- `wrong_fact`
- `missing_source`
- `poor_relevance`
- `too_verbose`
- `too_terse`
- `wrong_language`
- `bad_citation`
- `unsupported_recommendation`
- `useful`

Each feedback record includes user id, summary id, optional cited field, optional free text, timestamp and whether it is eligible for eval fixture conversion.

## Edge Cases

- No enough relevant items.
- Items conflict.
- Citation points to deleted item.
- User changes summary rules mid-run.
- New scan completes while summary job is running.
- Evidence item is deduped/merged after candidate selection.
- Summary request includes topic rules that conflict with safety or citation requirements.
- Model output cites source ids outside the frozen window.
- Raw source body is no longer retained but citation safe fields still exist.
- Deletion request removes cited evidence while summary is still user-visible.
- User regenerates while previous summary is still running.
- Summary is stale but still useful for historical audit.
- Topic language preference changes after request is accepted.
- Feedback references a summary that is now superseded.
- Item timestamp equals summary window start.
- Item timestamp equals summary window end and must fall into the next window.
- Provider returns an item with future published time but current observed time.
- Late item arrives after evidence selection and before model response.
- Regenerate command retries with the same idempotency key and fake clock.

## Pay Attention

- Summary must be reproducible enough for debugging.
- Store prompt/schema/model versions.
- Tenant policy may disable AI.
- Summary domain owns artifact validity, not provider-specific retry behavior.
- Do not edit completed artifact text after feedback; create a new regenerate lineage.

## Acceptance Criteria

- Summary request creates durable job.
- Summary output validates against schema.
- Every key claim has citations.
- Empty/no-signal summary is handled gracefully.
- Summary lineage is stored and visible for audit/debug.
- Stale, low-confidence and review-required states are distinguishable.
- Frozen evidence window and citation ids are validated before completion.
- Feedback taxonomy is defined without requiring prompt changes.
