# Pinned pre-refactor summary/model implementation inventory

Baseline: `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba`.
Root: `libs/summary/adapters/model/`.
Count source: physical, newline-normalized LOC fetched from GitHub at this exact SHA, **not yet behavior-refactored LOC**. All `*.spec.ts`, `*.test.ts`, `*.spec-support.ts`, `*.fixture.ts` plus `reader-summary-coverage-plan-test-fixture.ts` omitted. Source line counts include blank/comment lines: they are a size baseline only and must **not** be presented as 10,000 meaningful refactored implementation LOC. A per-slice audited counter follows implementation.

**Total: 84 eligible source files, 15,318 physical source LOC.**

## Group sizes

| Group | Files | Physical LOC |
|---|---:|---:|
| Shared | 14 | 1674 |
| Agent Runtime | 18 | 4354 |
| Deterministic | 6 | 1154 |
| Gateway LLM | 11 | 962 |
| OpenAI | 35 | 7174 |

## File-level baseline

| File (relative to model/) | Physical LOC |
|---|---:|
| `active-reader-summary-generation-profile.ts` | 463 |
| `agent-runtime-model-support.ts` | 290 |
| `agent-runtime-promotion-presentation-v3-runtime-failure.ts` | 109 |
| `agent-runtime-promotion-presentation-v3.builder.ts` | 397 |
| `agent-runtime-reader-summary-daily-editorial.ts` | 71 |
| `agent-runtime-reader-summary-model.adapter.ts` | 490 |
| `agent-runtime-reader-summary-story-relation-verifier-prompt.ts` | 246 |
| `agent-runtime-reader-summary-story-relation-verifier.adapter.ts` | 332 |
| `agent-runtime-reader-summary-topic-candidate-selection.ts` | 101 |
| `agent-runtime-reader-summary-topic-cohort-completion.ts` | 88 |
| `agent-runtime-reader-summary-topic-evidence-prompt.ts` | 63 |
| `agent-runtime-reader-summary-topic-grounded-cohorts.ts` | 150 |
| `agent-runtime-reader-summary-topic-group-recovery.ts` | 383 |
| `agent-runtime-reader-summary-topic-label-plan-normalizer.ts` | 397 |
| `agent-runtime-reader-summary-topic-labeler-prompt.ts` | 248 |
| `agent-runtime-reader-summary-topic-labeler.adapter.ts` | 250 |
| `agent-runtime-reader-summary-topic-relation-verifier-prompt.ts` | 103 |
| `agent-runtime-reader-summary-topic-relation-verifier.adapter.ts` | 277 |
| `agent-runtime-summary-model.adapter.ts` | 359 |
| `codex-reader-summary-route.ts` | 79 |
| `deterministic-reader-summary-evidence-selection.ts` | 117 |
| `deterministic-reader-summary-headline.ts` | 28 |
| `deterministic-reader-summary-model.adapter.ts` | 458 |
| `deterministic-reader-summary-narrative.ts` | 170 |
| `deterministic-summary-headline.ts` | 24 |
| `deterministic-summary-model.adapter.ts` | 357 |
| `gateway-llm/gateway-llm-account-selector.ts` | 85 |
| `gateway-llm/gateway-llm-attempts.ts` | 56 |
| `gateway-llm/gateway-llm-client.ts` | 292 |
| `gateway-llm/gateway-llm-deadline.ts` | 11 |
| `gateway-llm/gateway-llm-failure.ts` | 136 |
| `gateway-llm/gateway-llm-output-budget.ts` | 9 |
| `gateway-llm/gateway-llm-output-schema.ts` | 117 |
| `gateway-llm/gateway-llm-output-violations.ts` | 121 |
| `gateway-llm/gateway-llm-request-identity.ts` | 23 |
| `gateway-llm/gateway-llm-schema-limits.ts` | 90 |
| `gateway-llm/gateway-llm-sdk-identity.ts` | 22 |
| `grpc-agent-runtime-client.ts` | 420 |
| `metered-reader-summary-model.adapter.ts` | 150 |
| `metered-summary-model.adapter.ts` | 93 |
| `openai-api-key-source.ts` | 35 |
| `openai-promotion-presentation-v3.builder.ts` | 249 |
| `openai-responses-reader-summary-adaptive-evidence.ts` | 362 |
| `openai-responses-reader-summary-content-support.ts` | 278 |
| `openai-responses-reader-summary-contract.ts` | 36 |
| `openai-responses-reader-summary-daily-editor.ts` | 65 |
| `openai-responses-reader-summary-draft-normalizer.ts` | 434 |
| `openai-responses-reader-summary-editorial-narrative.ts` | 95 |
| `openai-responses-reader-summary-http.ts` | 46 |
| `openai-responses-reader-summary-json-schema.ts` | 204 |
| `openai-responses-reader-summary-json.ts` | 112 |
| `openai-responses-reader-summary-model-support.ts` | 18 |
| `openai-responses-reader-summary-model.adapter.ts` | 460 |
| `openai-responses-reader-summary-narrative-coverage.ts` | 98 |
| `openai-responses-reader-summary-narrative.ts` | 499 |
| `openai-responses-reader-summary-options.ts` | 61 |
| `openai-responses-reader-summary-parsers.ts` | 81 |
| `openai-responses-reader-summary-prompt.ts` | 300 |
| `openai-responses-reader-summary-response-parser.ts` | 103 |
| `openai-responses-reader-summary-schema.ts` | 218 |
| `openai-responses-reader-summary-story-normalizer.ts` | 470 |
| `openai-responses-reader-summary-weekly-model.adapter.ts` | 493 |
| `openai-responses-reader-summary-weekly-prompt.ts` | 88 |
| `openai-responses-reader-summary-weekly-response-parser.ts` | 434 |
| `openai-responses-reader-summary-weekly-response-shapes.ts` | 152 |
| `openai-responses-reader-summary-weekly-schema.ts` | 164 |
| `openai-responses-summary-citations.ts` | 174 |
| `openai-responses-summary-draft-normalizer.ts` | 358 |
| `openai-responses-summary-draft-shape.ts` | 96 |
| `openai-responses-summary-json.ts` | 127 |
| `openai-responses-summary-model-error.ts` | 81 |
| `openai-responses-summary-model.adapter.ts` | 445 |
| `openai-responses-summary-prompt.ts` | 130 |
| `openai-responses-summary-response-parser.ts` | 94 |
| `openai-responses-summary-schema.ts` | 114 |
| `reader-post-canonical-presentation-instructions.ts` | 21 |
| `reader-summary-daily-editorial-model.ts` | 91 |
| `reader-summary-daily-input-receipt.ts` | 31 |
| `reader-summary-evidence-citation-map.ts` | 27 |
| `reader-summary-execution-attestation.ts` | 153 |
| `reader-summary-failed-daily-editor-usage.ts` | 18 |
| `reader-summary-narrative-repair-contract.ts` | 16 |
| `story-relation-response-schema.ts` | 65 |
| `summary-provider-labels.ts` | 47 |

## Refactor verification ledger (must be filled by implementation)

For each slice record original source paths, before/after architectural responsibility and test evidence, meaningful original *code* lines refactored, exact HEAD SHA, and review/CI results. Never count the same original code twice. File movement without a real responsibility/dependency improvement does not count. Provisional source-to-destination ledger (move-size only; **NOT** yet accepted meaningful LOC):

| Slice | Original module | New responsibility boundary | Original physical lines moved | Qualifying implementation LOC |
|---|---|---|---:|---|
| OpenAI weekly response parsing | `openai-responses-reader-summary-weekly-model.adapter.ts` | `openai-responses-reader-summary-weekly-response-contract.ts` | 269 | Pending tests/review and implementation-only count |
| gRPC Agent Runtime response/attestation codec | `grpc-agent-runtime-client.ts` | `grpc-agent-runtime-wire-codec.ts` | 218 | Pending tests/review and implementation-only count |
| OpenAI summary transport | `openai-responses-summary-model.adapter.ts` | `openai-responses-summary-transport.ts` | 55 | Pending tests/review and implementation-only count |
| Deterministic summary metadata/text ownership | `deterministic-summary-model.adapter.ts` | `deterministic-summary-source-highlights.ts` (metadata/reasons), `deterministic-summary-text.ts` (editorial/memory text); adapter retains budgets/orchestration | 150 | 121 provisional original nonblank code LOC; exact-head tests pending |
| Deterministic reader evidence/story/text ownership | `deterministic-reader-summary-model.adapter.ts` | existing `deterministic-reader-summary-evidence-selection.ts` (pinned cluster selection); new `deterministic-reader-summary-story-projection.ts` and `deterministic-reader-summary-text.ts` | 117 | 102 candidate original implementation LOC; awaiting exact-head CI |
| Gateway predispatch validation and result attestation | `gateway-llm/gateway-llm-client.ts` | `gateway-llm/gateway-llm-task-preparation.ts` (route, strict schema, deadline); `gateway-llm/gateway-llm-task-completion.ts` (receipt/identity, selected output, usage and attestation). Client retains retry, account observation, dispatch. | 121 | **97 provisional unique conservative original code LOC**; exact-head CI/review pending |
| **Total provisional** | | | **930** | **320 candidate original code LOC across 3 distinct baseline modules; earlier 542 physical unaudited** |

These are unique *source text* lines from pinned main, including comments/blank lines and wrapper text, not automatically 542 meaningful implementation LOC. CI attempts on superseded SHAs do not prove final acceptance. Latest code fix: `8729ac2b70c2d4e06bb91db1bfd9732ecfe2e6d5`, exact-head draft 3-check CI pending at ledger entry.

### Deterministic metadata/text source-to-destination audit (2026-11-09)

- Parent commit: `a56fd2ff3ccca28bd54840ca56227266a11d3cf8`; implementation SHA recorded in PR conversation. Pinned original `deterministic-summary-model.adapter.ts` contains 357 physical LOC. 150 original physical lines reorganized: 18 executive summary, 103 metadata/highlights, 29 no-signal/memory. Of these, 121 source lines are nonblank, noncomment original implementation (15 + 83 + 23). No ledger overlap; these are **provisional**, not accepted toward 10k until exact-head checks and independent review.
- Ownership: external GitHub repository metadata decoding / memory preference reason ordering moves to `deterministic-summary-source-highlights.ts`; deterministic narrative/no-signal/memory rendering to `deterministic-summary-text.ts`; adapter continues to own port, route/budget, usage, lineage and draft composition. Preserves output copy, provider/model IDs, schema, fallback and failure diagnostics. No schema, contract, dependency or deploy edits.
- Regression coverage authored: `deterministic-summary-source-highlights.spec.ts` for preferences, trending/7d metadata, malformed/nonfinite payloads; existing `deterministic-summary-model.adapter.spec.ts` covers adapter rendering. Focused Jest and exact-HEAD full CI pending; revert this bounded code slice if contracts diverge.

### Deterministic reader evidence/story/text responsibility split (2026-11-09)

- Parent HEAD `10ed22e2eff3d37f8703bdbdd3481d8e7af57631`; final implementation SHA in PR conversation. Pinned original `deterministic-reader-summary-model.adapter.ts`: 458 physical LOC. Unique extracted original slices: 34 text (28 nonblank code), 33 story/highlight (30 code), 50 pinned-cluster selection (44 code), total **117 original physical / 102 candidate code LOC**. Also removed five-line trivial `selectRankedEvidence` forwarding helper and directly call existing provider diversity policy; its five lines are deliberately not counted. No overlap with any preceding original ledger source.
- Before: port model adapter mixed budget/draft orchestration with text copy, citation interest projection, pinned cluster selection. After: cluster priority/fallback lives with existing deterministic evidence selection, presentation text in `deterministic-reader-summary-text.ts`, story/interest projection in `deterministic-reader-summary-story-projection.ts`. Model route, no-signal response, lineage, policy flags, primary and editorial evidence paths unchanged.
- Tests authored: new focused pinned/missing/duplicate cluster selection and invalid-limit test; existing `deterministic-reader-summary-model.adapter.spec.ts` publishes provider-diverse daily/single-story drafts with content and headline invariants. All runnable checks still pending exact-head CI; no independent review approval inferred.


### Gateway LLM source audit addendum — 2026-11-09

Original source: `libs/summary/adapters/model/gateway-llm/gateway-llm-client.ts` at pinned baseline `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba` and pre-slice `83ad7fd78971232f3253d055a59054e15531df40`, identical blob `48b76553ae9de4c8283d6c158af502b3a06ce65d`, 293 newline-split physical lines (inventory's 292 normalized LOC). Disjoint original ranges delimited by `private prepare(` → `private withAttempt(` (71 physical; 54 source code lines conservatively excluding blank, comments and brace-only lines) and `private completed(` → `private observe(` (50 physical; 43 code). **97 unique original code lines provisional**. A pure move without meaningful ownership is never eligible; here trust-boundary preparation and attested receipt completion become independently named provider-infrastructure responsibilities, while orchestration remains in the client. Line accounting does not count added tests, duplicated type imports, new helper names or any unchanged original lines.

Implementation commit `f5e6bf288385e54706c3677c9abb13bfc8be4b2b`; test expectation correction `f54da4c7f79e519fb2732ea890d4962b47b3676d`. The new integration cases reject four predispatch-invalid tasks with zero gateway attempts and preserve text-only output/attestation; tests are **authored, not yet verified passing**. Current-main divergence and exact-head Draft CI must be rechecked after subsequent commits. **Cumulative only 320 candidate unique code LOC from 3 audited baseline files**, other changed files await original-line qualification. The 10,000-LOC acceptance threshold has not been met.
