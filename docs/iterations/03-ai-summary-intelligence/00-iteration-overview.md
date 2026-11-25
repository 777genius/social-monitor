# Iteration 03 - AI Summary Intelligence Overview

## Goal

Turn collected items into reliable, cited, configurable summaries.

The AI layer must be governed, testable and cost-controlled. It must not be a prompt hidden inside a worker.

## Domain Concepts

- `SummaryRequest` - user/system request for a topic/time window.
- `SummaryRuleSet` - user-configurable style, focus and exclusions.
- `SummaryInputWindow` - selected items with provenance.
- `SummaryArtifact` - structured output with citations.
- `PromptVersion` - prompt/template/schema version.
- `ModelRoute` - provider/model/cost/latency policy.
- `EvaluationRun` - quality, citation and regression checks.

## MVP Summary Contract

The first production summary is a structured, cited artifact. It is not free-form markdown.

| Section | Required | Purpose |
| --- | --- | --- |
| `headline` | yes | short title for the summary window |
| `executiveSummary` | yes | concise paragraph with citation references |
| `keyPoints[]` | yes when signal exists | factual claims, each with citations |
| `risksAndUnknowns[]` | yes | uncertainty, conflicting evidence and missing source limitations |
| `sourceHighlights[]` | yes when items exist | important items grouped by source/provenance |
| `recommendedFollowUps[]` | optional | user-facing next checks, never unsupported instructions |
| `noSignalReason` | required for empty/no-signal | why no useful summary was produced |
| `citationMap[]` | yes | source item/feed item ids and evidence fields |
| `qualityFlags[]` | yes | stale, low_confidence, conflicting_evidence, limited_sources |
| `lineage` | yes | prompt/schema/model/rules/source-window/eval versions |
| `usage` | yes | tokens, estimated cost, provider route and budget result |

Rules:

1. Every factual key point needs at least one citation.
2. A recommendation needs cited evidence or explicit uncertainty.
3. No-signal output is valid only when the schema explains why there is no useful signal.
4. Low-confidence output can be stored, but must not be displayed as a normal completed summary.
5. Summary text must not contain raw provider prompts, credentials or hidden system instructions.

## MVP AI Scope

Build deeply:

1. deterministic fake AI provider for tests
2. one replaceable real provider adapter
3. structured output validation
4. claim-to-citation validation
5. cost preflight and usage records
6. prompt/schema/model versioning
7. feedback to eval fixture workflow

Keep as extension point:

1. multi-model routing beyond simple cost/risk tiers
2. multi-agent research chains
3. fine-tuning
4. complex semantic clustering
5. personalized writing styles beyond rule-set fields
6. automatic fact-checking outside available source evidence

## Phase Map

1. `01-summary-domain-contract.md` - schemas, states, citations and rules.
2. `02-ai-provider-adapter.md` - LLM provider ports, routing, retries, redaction.
3. `03-evals-and-quality.md` - regression harness and quality gates.
4. `04-summary-ux-readiness.md` - API/read models for frontend summary UX.

## Detailed Steps

1. Define summary output JSON schema.
2. Define citation requirement per key claim.
3. Define empty/no-signal summary behavior.
4. Define input selection: relevance score, freshness, source diversity.
5. Define per-topic summary rules.
6. Define prompt template variables and validation.
7. Define AI provider port.
8. Implement model routing by cost/latency/risk.
9. Add prompt and schema version storage.
10. Add LLM input redaction where required.
11. Add structured output validation and repair policy.
12. Add summary job workflow with idempotency.
13. Add hallucination/citation checks.
14. Add human-review state for low confidence.
15. Add frontend summary read model.
16. Add feedback-to-eval fixture workflow.

## Edge Cases

- No items match the topic window.
- Items conflict with each other.
- A cited item is deleted after summary generation.
- User changes rules during a running summary.
- AI provider returns invalid JSON.
- Provider outage happens mid-job.
- Summary exceeds token or cost budget.
- Tenant disables AI processing.
- Source terms disallow AI summarization.
- Summary language differs from item language.
- Evidence item is hidden after summary but before user opens it.
- AI output cites an item that belongs to another topic or tenant.
- Summary rules ask for a tone/format that conflicts with citation requirements.
- Model output uses citation ids that do not exist.
- Cost estimate passes but actual usage exceeds estimate.
- Feedback says summary is wrong but cited item has also changed.

## Pay Attention

- AI output is not source truth.
- Store enough metadata to debug every summary.
- User-facing text must expose uncertainty and source limits.
- Do not put private/member-only content into AI unless explicitly authorized.
- Relevance scoring and summarization should be separate steps.
- Never let source item text act as instructions for the summarizer.
- Prefer failing safely over displaying polished but uncited text.
- Store enough lineage to reproduce the class of failure without storing sensitive prompts by default.

## Quality Gates

- Summary schema validation tests pass.
- Prompt regression suite exists.
- At least 20 fixture cases cover empty, noisy, conflicting and multilingual inputs.
- Cost estimate is computed before job execution.
- Every completed summary has citations or explicit no-citation reason.
- Failed summaries have actionable failure reasons.
- Prompt-injection fixtures cannot alter instruction hierarchy.
- Feedback taxonomy can create new eval fixtures without changing summary domain.

## Done Criteria

Iteration 03 is complete when topic items can be clustered/selected and summarized into a cited artifact that the frontend can display, regenerate and audit.
