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

### OpenAI summary citation trust/reference responsibility split (2026-11-09)

- **Implementation commit:** `ef8c270037b5ab9082ba1720d65659090b3a8931` on the existing Draft PR #665, parent `e39f39f052958d78b6825b763ab5ea9ec91931a0`. At this ledger write the branch HEAD is `ef8c270037b5ab9082ba1720d65659090b3a8931` (recheck before qualification).
- **Unique original source:** `libs/summary/adapters/model/openai-responses-summary-citations.ts` is byte-identical on pinned main `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba` and pre-slice PR branch (Git blob `a6c98d37e6b670b9cb84bc4350a065d884db229c`). Two disjoint original blocks were extracted: `fallbackCitationMap` through `chooseEvidenceCitationField`, and `withKnownCitationIds` through the private `knownStringSubset`. **107 original physical lines / 75 conservatively counted nonblank noncomment non-brace-only code lines**. The count excludes imports, new tests, compatibility reexports, untouched citation parsing, any duplicate and formatting. This original file was absent from the prior audited 3-file/320-LOC ledger.
- **Responsibilities:** `openai-responses-summary-citations.ts` still strictly decodes untrusted citation map fields and preserves the original named API; `openai-responses-summary-evidence-citations.ts` owns fallback citation IDs, selected-evidence rebinding and source field fallback; `openai-responses-summary-citation-references.ts` owns stable, duplicate-free known citation reference pruning. `openai-responses-summary-draft-normalizer.ts` now explicitly imports the three responsibilities instead of treating parsing and evidence grounding as one operation. Provider citations never supply trusted feed/source/provider/URL identities.
- **Regression evidence authored:** four new focused Jest scenarios cover unknown citation field/malformed feed ID rejection; fallback field selection; spoofed source/provider fields and unknown citation ID removal; known reference deduplication and risk preservation. Existing adapter tests already cover evidence validation, non-array map fallback and end-to-end response normalization. These are **authored, not yet locally executed**: this environment has GitHub connector access but no local checkout/node_modules/network DNS. Qualify by exact-head GitHub CI before accepting the source code lines.
- **Accounting:** **395 provisional unique original implementation LOC across 4 audited pinned source files (320 previous + 75 this slice)**, pending independent review and tests; not claimed as accepted ≥10,000. The remaining changed baseline files (including other agents' commits) must be audited individually without counting unchanged/moved-only lines. This is not an additive diff LOC metric.
- **Safety:** no prompt/model/schema/dependency/feature flag change; no production or #620/#663/#664 changes. Required follow-up: TypeScript/Jest, static architecture, security, full non-Draft 20/20 CI incl six native PG18 shards, current-main reconciliation and independent CodeRabbit/ReviewRouter/human final review.

### Conservative original-code declaration provenance — Nov 9 second pass

**Pinned baseline:** `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba` (84 eligible originals / 15,318 physical LOC). This is a **review candidate audit, not accepted or proven architecture-improvement LOC**. These 16 originals are distinct from the earlier deterministic-summary, deterministic-reader, gateway-client and newly split summary-citation originals (395 candidate LOC across four files). The branch-head review snapshot before updating this inventory was `07b057a3f479172bd48ad07e7d5c37f3fee1265f`; requalify the eventual new doc-commit HEAD.

Method: fetch each *original* file at pinned baseline and each corresponding specialist module at the current PR branch; enumerate top-level named original declarations and their specialist declaration with the same name; for each original declaration, count original nonempty, noncomment, non-brace-only implementation lines that occur in the specialist declaration (whitespace-normalized multiset; duplicates counted only to their original multiplicity), requiring at least 70% original-line retention to establish reliable identity. Exclude types, blank/comment-only lines, tests, imports, unmatched lines and newly written code. Different source files are counted once, and no previously counted original file appears below. **Exact statement retention is source-provenance evidence, not proof of improved responsibility boundaries; copied/moved-only material, helpers without changed architectural ownership, or insufficient tests/review must be subtracted before acceptance.**

| Original file (relative to model/) | New specialist responsibility (relative to model/) | Provenance-traced original code candidate |
|---|---|---:|
| `agent-runtime-model-support.ts` | `agent-runtime-model-failure.ts` (gRPC/provider failure decoding) + `agent-runtime-model-usage.ts` (metering, retry-budget rules) | 131 |
| `active-reader-summary-generation-profile.ts` | `reader-summary-gateway-route-policy.ts` (gateway-only selection) + `reader-summary-generation-identity-policy.ts` (daily identity/effort policy) | 196 |
| `openai-responses-summary-draft-normalizer.ts` | `openai-responses-summary-key-points.ts` (claims) + `openai-responses-summary-quality.ts` (risks/confidence) + `openai-responses-summary-text.ts` (copy) | 163 |
| `openai-responses-reader-summary-content-support.ts` | `openai-responses-reader-summary-content-items.ts` (citation-backed items) + `openai-responses-reader-summary-content-quality.ts` (quality/source metrics) | 159 |
| `openai-responses-reader-summary-narrative.ts` | `openai-responses-reader-summary-narrative-evidence.ts` (evidence) + `-markdown.ts` (copy) + `-validation.ts` (coverage) | 227 |
| `openai-responses-reader-summary-story-normalizer.ts` | `openai-responses-reader-summary-story-citations.ts` (cluster citations) + `-fallback.ts` (deterministic story top-up) + `-input.ts` (provider mapping) | 190 |
| `agent-runtime-reader-summary-topic-group-recovery.ts` | `agent-runtime-reader-summary-topic-group-consensus.ts` (group consensus/anchors) | 129 |
| `openai-responses-reader-summary-adaptive-evidence.ts` | `openai-responses-reader-summary-source-content.ts` (fragment policy) + `-evidence-projection.ts` (presentation context) | 170 |
| `openai-responses-reader-summary-prompt.ts` | `openai-responses-reader-summary-prompt-payload.ts` (prompt projection) + `-daily-instructions.ts` (daily/legacy instructions) | 129 |
| `openai-responses-reader-summary-weekly-response-parser.ts` | `openai-responses-reader-summary-weekly-legacy-normalization.ts` (legacy/sealed weekly validation) | 281 |
| `openai-responses-reader-summary-weekly-model.adapter.ts` | `openai-responses-reader-summary-weekly-response-contract.ts` (strict completed-state/refusal decoder) | 177 |
| `grpc-agent-runtime-client.ts` | `grpc-agent-runtime-wire-codec.ts` (wire usage, attestation, statuses) | 167 |
| `agent-runtime-reader-summary-topic-label-plan-normalizer.ts` | `agent-runtime-reader-summary-topic-raw-decoder.ts` (bounded raw input) | 26 |
| `openai-responses-reader-summary-draft-normalizer.ts` | `openai-responses-reader-summary-quality.ts` (risk/flag/confidence normalization) | 50 |
| `openai-promotion-presentation-v3.builder.ts` | `openai-promotion-presentation-v3-headline.ts`, `-schema.ts`, `-response-contract.ts`, `-response-codec.ts` (headline, schema trust, output decoding) | 132 |
| `agent-runtime-promotion-presentation-v3.builder.ts` | `agent-runtime-promotion-presentation-v3-request.ts` (request/attestation input) + `-proposal.ts` (proposal validation) | 86 |
| **Additional provenance candidates, 16 distinct pinned originals** | | **2,413** |
| Earlier narrowly inspected 4 distinct pinned originals (including citation slice) | See preceding 395-LOC ledger | **395** |
| **Cumulative provenance candidates, 20 distinct pinned originals** | **Not accepted as meaningful implementation LOC yet** | **2,808** |

The original `openai-responses-summary-citations.ts` additionally has 107 physical / 75 conservatively eligible original code lines transferred to independently named evidence trust and reference filtering modules; this is part of the preceding 395 and is **not** counted again. The previous three-source candidate 320 + citation 75 = 395. Each of the 2,413 lines above requires per-slice architectural judgment and focused behavioral verification; simple extraction alone must not satisfy the user's hard ≥10k threshold. The current investigatory candidate deficit is **at least 7,192**, even before rejecting moved-only statements. No accepted ≥10k claim.

**Exact-head test/CI correction:** [Draft run #42541094718](https://github.com/777genius/social-monitor/actions/runs/42541094718) found TS2352 in the synthetic minimal evidence fixture (production code unaffected), fixed in `07b057a3f479172bd48ad07e7d5c37f3fee1265f`. [Exact code HEAD run #42541579120](https://github.com/777genius/social-monitor/actions/runs/42541579120) completed all **three** Draft checks successfully (Static architecture and quality; Security and public contracts; Flutter architecture and tests). GitHub exact-code-head Jest execution must not be inferred from status alone; the full Ready 20/20 incl six native PG18 shards, backend E2E/image and independent reviews have **not** run or approved this PR. Do not merge, publish, or touch the separate #620/#663/#664 PRs. The branch was three commits behind contemporary main at last comparison.

### Execution attestation: pure trust policy vs audited recording (2026-11-09)

- **Implementation commit** [`1cb0684`](https://github.com/777genius/social-monitor/commit/1cb0684fa79e808ee7d6467cfe78afc5e3571ec5), parent `546814485301f39585c13d368bca8add5b77bc56` in the SAME Draft PR #665. This does not change the public `verifyAndRecordReaderSummaryExecution` entrypoint or the exported task-role type.
- **Pinned original** `libs/summary/adapters/model/reader-summary-execution-attestation.ts`, blob `380ad573f2a97c2220f15a99412ac43d1976c907`, matched current branch before the slice: 153 physical lines. The new `reader-summary-execution-identity-policy.ts` owns the same fail-closed validation logic for command/request/purpose/provider/model/effort/backend/runtime identity, legacy recovery, output kind/hash and purpose-attempt combinations. The original entrypoint now only validates, hashes normalized output and records via the injected sink; no new I/O/dependency/configuration.
- **Conservative origin count**: **77 candidate unique pinned original implementation lines** in the extracted validation and purpose/effort policy, excluding role/type exports, imports, comments, blank and brace-only lines. No prior ledger entry references this original source. Identity was verified by extracting the original conditional and policy helpers as exact source text; only moving ownership to an independently testable trust policy is the architectural rationale. These lines remain **provisional**, not accepted without targeted test execution and independent review; copied-only code is not accepted merely for moving.
- **Regression tests added**: eight synthetic table-driven negative cases in `reader-summary-execution-identity-policy.spec.ts`: request, purpose, provider, model, effort, request digest, selected-output digest, selected-output kind. Every case asserts fail-closed rejection, exactly one task attempt, and **zero writes to the attestation sink**. Existing adapter integration checks also cover successful recording, repairs, MiMo legacy and text-output restrictions. Tests are authored but **not verified by local Jest/TS** in this connector-only workspace.
- **Risk and gates**: TS import resolution/fixture compilation, exact schema and string preservation, digest integrity, native runtime and final CI still require actual qualification. Never interpret the three Draft checks as the 20/20 Ready CI. CodeRabbit/ReviewRouter/human approvals are not present. Main comparison before doc commit: **3 behind, 63 ahead**; reconcile only during full final qualification, without changing #620/#663/#664 or deployment.
- **Candidate running count**: previously 2,808 across 20 original sources + 77 from this distinct source = **2,885 provisional, provenance-only candidate implementation lines across 21 original files**. At least 7,115 remain before reaching 10,000 *even if every candidate survives architectural review*; the accepted threshold is unproven. The documentation commit/updated exact HEAD will need fresh CI after this entry.

### Reader model metering: delegate lifecycle vs telemetry semantics (2026-11-09)

- **Implementation commit:** [`44fa934`](https://github.com/777genius/social-monitor/commit/44fa9349725deb9e92faa9672049769f8d5f2f59), parent `cd0da95eefd843023b4399980170c26a0c87be27`, existing single Draft PR #665.
- **Original pinned source:** `libs/summary/adapters/model/metered-reader-summary-model.adapter.ts` (150 physical lines, blob `3a0be096537034cbd750bd87a2bf7c1b46c99715`) exactly matched the pre-slice branch. Two private metric-writing methods (usage and request) are now concrete functions in `reader-summary-model-metrics.ts`; the metered adapter retains only delegation, start/success/failure lifecycle, exception classification and the editor's billed-usage contract. Metrics policy owns canonical metric names, job type, null-token handling and label shape; no generic framework or new dependency.
- **Conservative source candidate:** **43 unique pinned original implementation code lines** from those two disjoint original methods after excluding comments/blank/brace-only lines. The source was not used in any earlier audited ledger. This is **provisional responsibility evidence**, not accepted architectural LOC; mechanical relocation does not itself qualify.
- **Focused authored tests:** `reader-summary-model-metrics.spec.ts` covers null token metering with preserved cost, both input/output counters and reader job labels, and failure-kind request label policy. Existing metered adapter tests cover a successful daily plan+generate path, billed rejected editor output, failed runtime usage, frozen-error handling, and predispatch-no-cost gateway failures. Jest/TS remain unverified locally; real CI required.
- **Cumulative**: previous 2,885 provenance candidates across 21 pinned originals + 43 from this distinct original = **2,928 candidates across 22 original source files**. At least 7,072 more independently qualified original implementation lines would be needed for a ≥10,000 claim, *before subtracting moved-only candidates*. Do not mark the PR Ready or merge.
- **Risk:** metric observability/labels, TypeScript imports and existing in-memory recorder semantics need focused Jest; maintain exact metric names and paid-failure handling. No prompts, schemas, credentials, backend selections, provider IDs, dependency updates, flags, deployment or concurrent PRs changed. Main at this ledger read: 3 commits behind and 65 ahead; final merge needs reconciliation, 20/20 Ready checks (PG18 six shards, image/security), independent human/CodeRabbit/ReviewRouter finding resolution and post-merge CI.

### Exact-head Draft CI failure and typed fixture repair (2026-11-09)

- [Draft workflow #42544007595](https://github.com/777genius/social-monitor/actions/runs/42544007595) for `cf23de76ba76ca5a54b06851f02b18500dae6330`: **Security SUCCESS**, **Flutter architecture SUCCESS**, **Static architecture and quality FAILURE**. Full backend Jest/PostgreSQL/image jobs were skipped because this is still Draft.
- Static job log confirmed a single `TS2322` error in newly authored `reader-summary-execution-identity-policy.spec.ts`: the forged provider fixture used an impossible `AgentRuntimeProvider` literal. Existing port contract permits only `"codex" | "claude"`. [Commit `cc9c5b2`](https://github.com/777genius/social-monitor/commit/cc9c5b215d2b97aa21084394b5a60f003cc49385) fixes **only the synthetic test fixture**, substituting the valid alternate `"claude"` to retain the provider-mismatch negative case. No production logic was changed; source LOC ledger remains **2,928 provisional candidates across 22 original sources**, zero newly qualified original lines from this test fix.
- New exact code HEAD `cc9c5b215d2b97aa21084394b5a60f003cc49385` has Draft run [#42544685768](https://github.com/777genius/social-monitor/actions/runs/42544685768) queued at this entry, **not yet qualified**. Full 20/20 and independent reviews remain absent. Keep Draft; do not merge/deploy.

### Reader summary response trust boundaries: usage vs claim citations (2026-11-09)

- Parent exact PR HEAD before this slice: `88bfe23474f3b851eb565ebd8ac402cf450790bb`, with baseline `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba`. Baseline and pre-slice `openai-responses-reader-summary-response-parser.ts` blobs were independently confirmed identical (`0247efea9d675e546fdc8d1b23eed962d967c551`). This is new source provenance, not included in the preceding 22 originals.
- Original-to-new responsibility: `openai-responses-reader-summary-response-parser.ts` still owns provider output-text selection, strict nested-output shape and JSON object parsing; `openai-responses-reader-summary-usage.ts` owns untrusted/nonfinite token count fallback while retaining route-estimated cost; `openai-responses-reader-summary-claim-citations.ts` enforces explicit nonempty citation arrays before draft normalization. Direct re-exports remain supported at the old parser entrypoint, while the model-support barrel now points at the owning modules.
- Conservative counted original implementation lines: **33** source-code-like lines (15 usage, 18 claim guard). Excluded blank, comment and braces-only lines, imports, reexports and all authored tests. This separate original source has not previously entered the source ledger. **Provisional only**: no mechanical moves or code-count claims are accepted as a substitute for demonstrated architectural value and passing tests/reviews.
- Focused Jest specifications authored: finite/zero/nonfinite/negative/missing token usage; estimated cost invariant; all four citation surfaces with explicit empty list fail-closed; permissive pass-through for absent/non-array fields left to downstream shape validation; nested output and invalid JSON object parser. **Not locally run** in connector-only workspace (no checkout/dependencies); the next exact-head CI, Jest and independent review must qualify this slice. Prompt/model ID/schema, provider/tenant route, attestation, credentials, deadlines, and deterministic fallback are unchanged.
- **Running provenance candidates: 2961 across 23 distinct original source files** (prior 2,928 + this distinct source 33); 7039 further even if every provisional candidate were accepted. Final ≥10k, full ready 20/20, PG18 shards, independent reviews and merge are still outstanding. Concurrent #620/#663/#664 and production deployment untouched.

### Deterministic reader narrative vs provider-diverse citation allocation (2026-11-09)

- Parent code HEAD: `5b05dde7ef3cfbb07a57f9f076db7be9c33de68f`, pinned original `deterministic-reader-summary-narrative.ts` unchanged since `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba` (Git blob `e131f0dc2235a9be89e8867d1d1e28e3127cb33a`). The pinned source was not previously entered in the original-line ledger.
- Before: narrative renderer owned grouping by feed item, provider-frequency diversity, stable tiebreak, single-story citation aggregation, and copy creation. After: `deterministic-reader-summary-citation-selection.ts` owns evidence citation allocation, with a single selection result containing lead IDs and daily secondary cluster IDs; `deterministic-reader-summary-narrative.ts` owns narrative section rendering and mode-specific copy. It preserves the exact original helper bodies and output order. No generated IDs, model/provider route, text copy, schema, prompt, expense, attestation or fallback behavior changes.
- Conservatively **67 unique original source-code-like implementation lines** from the original four private helper functions, excluding blank/comments/brace-only/import/test/new wrapper code. Moving text by itself is not automatically qualified; the identifiable citation-policy vs editorial copy ownership and direct regression cases are the architectural rationale. **Cumulative provenance candidates now 3028 from 24 pinned distinct source files**; still at least 6972 under target even if all candidates survive review. No accepted 10k claim.
- Five new focused tests authored for rare-provider lead selection, deterministic provider tie-breaking, single-story cited feed order and dedupe, empty evidence, and citation uniqueness. Existing `deterministic-reader-summary-narrative.spec.ts` remains as an end-to-end provider-diversity regression. Tests await exact-head executable Jest/TS, three Draft checks are insufficient for the final 20/20 Ready and PG18 six shards. Independent reviews are still absent; do not merge or deploy.

### Exact move review fix (2026-11-09)

- Follow-up to the deterministic citation selector extraction on parent HEAD `b8734f66d6b191b4a0255adada4df8f2e95dac6c`: a static manual review detected that the initial transformation had also dropped the original `topStoryByClusterId` map definition, even though narrative title/summary rendering still depends on it. Restored the identical original map construction before citation selection. This is a **production TypeScript correctness correction**, not a new source refactor or additional count: the verified provenance counter stays **3,028 provisional across 24 originals**. The superseded intermediate commit must not be reported as passing or considered releasable. Verify fresh exact-head CI, direct narrative Jest and existing provider-diversity regression. No prompt/schema/route/deploy change.

### Ordinary agent-runtime summary config/validation provenance slice (2026-11-09)

| Pinned original (relative to model/) | Newly owned responsibility | Distinct original implementation LOC candidate |
|---|---|---:|
| `agent-runtime-summary-model.adapter.ts` | `agent-runtime-summary-options.ts` (env/gateway route and provider identity) + `agent-runtime-summary-response-validation.ts` (normalized schema/route rejection) | **40** (27 + 13) |

Pinned original SHA `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba`, blob `be412753d82573557f7b19c170457966dc8e65dd`. Implementation `b33c7eacfc9c4648891467542a7596a0c1424e7e`, synthetic typed fixture fix `028c538842791ef699ecf87c3fe237cad6bd700a`. Original method ranges were disjoint and not included among the prior 24 audited baseline modules. Detailed original-code line selection, tests, risks and limits appear in the plan. **Only 40** source behavior statements are counted, not all 77 physical lines or 59 nonblank-code-like lines, and none is accepted without executable tests and independent review. **Cumulative candidate total: 3,068 across 25 unique pinned originals.** A minimum of 6,932 additional candidate original implementation lines remains, before rejection of moves without architectural value. Full 20/20 Ready CI, independent approval and merge are not satisfied.
