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
| **Total provisional** | | | **542** | **0 accepted yet** |

These are unique *source text* lines from pinned main, including comments/blank lines and wrapper text, not automatically 542 meaningful implementation LOC. CI attempts on superseded SHAs do not prove final acceptance. Latest code fix: `8729ac2b70c2d4e06bb91db1bfd9732ecfe2e6d5`, exact-head draft 3-check CI pending at ledger entry.
