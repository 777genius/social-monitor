# Social Monitor · ≥10,000 unique source LOC model-adapter refactor

Status: **PLAN ONLY — implementation is prohibited until the critical-review rounds below are closed**. Baseline `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba` (2026-11-08). One Draft PR; staged, reviewable commits inside it.

## Why / exact bounded context

The `libs/summary/adapters/model/` infrastructure boundary contains 93 non-`*.spec.ts` / `*.test.ts` TypeScript files (~601 KB of source), including OpenAI Responses (~249 KB), agent-runtime (~186 KB), deterministic (~37 KB), gateway-LLM (~43 KB), and shared support (~86 KB). These preliminary inventory byte counts were followed by the exact pinned-SHA physical-LOC inventory below. This is a substantial enough area to target ≥10,000 unique original implementation LOC without touching unrelated bounded contexts.

The code is already partly modular; this is **not** permission to create generic provider frameworks or move code just to inflate a diff. The desired outcome is clear responsibility and import boundaries for provider transport, provider-specific prompting/schema/parsing, execution attestation, budgets and model orchestration, with unchanged public ports and runtime behavior.

## Non-negotiable scope and invariants

- **In:** `libs/summary/adapters/model/**` and its necessary, minimal composition-root imports, directly related regression tests and architecture checks.
- **Out:** separate open PRs #620, #663, #664; scripts/staging/source-live security refactors; unrelated backend contexts; Flutter screens; schema/migrations, provider enablement, production deployment, dependency upgrades and feature flags.
- Keep `ReaderSummaryModelPort`, `AgentRuntimeClientPort`, effective provider/model selection, configuration provenance, token/cost budgets, error kinds, deadlines, retries, execution attestation, privacy/redaction, persisted lineage and fail-closed production/beta gates unchanged.
- Preserve the **exact** prompts, JSON schemas, validation ordering, citations, output normalization and observable failure diagnostics unless an independently reviewed, explicitly tested defect fix is justified and isolated.
- Dependencies point inward. Do not import transports or frameworks from domain or application. Provider SDK/gRPC/HTTP stays in infrastructure. No circular imports, magic globals, hidden I/O, new abstract factories without a concrete current use.
- No human-written source/test >1000 LOC; preserve local hooks and all existing CI checks. Never use real user-project agent/runtime flows.

## Qualification: minimum 10,000 original implementation LOC

The pinned baseline inventory is available at `docs/iterations/2026-11-08-summary-model-adapters-10k-inventory.md`: **84 eligible source files, 15,318 physical LOC**, after excluding tests, `*.spec-support.ts`, `*.fixture.ts`, and `*-test-fixture.ts`. Physical LOC (including comments/blanks) is **not** meaningful original implementation LOC, and none of it is claimed as refactored yet. Before implementation, use the file-level baseline inventory from the pinned main SHA, excluding generated, test, fixture and documentation LOC. Record actual physical LOC for each targeted source file, export surface and dependent consumers. After each slice, record **unique original LOC whose implementation responsibility or dependency boundary was materially refactored**; count each original line at most once. Mechanical formatting, comments, duplicate copies, renamed-but-otherwise-unimproved files and newly added tests do **not** contribute. Qualify the PR only with auditable ≥10,000 unique original implementation LOC and source-to-destination mapping, accompanied by `git diff --find-renames` and imports/export parity checks. Do not claim the threshold based on this preliminary byte estimate.

If real audited scope cannot reach 10k while remaining cohesive, expand **only within this bounded context** with another justified responsibility slice; do not include unrelated work or pad code.

## Sequential implementation slices (one PR, multiple commits)

1. **Baseline and mapping.** Inventory all model-adapter consumers and exports; categorize by responsibility, hash immutable prompt/schema fixtures; run focused baseline tests. Establish a no-op fixture parity comparison for normalized outputs, budget/error/deadline and attestation contracts.
2. **Provider transport boundaries.** Keep request execution, HTTP/gRPC errors, timeouts, aborts and response decoding in provider-specific infrastructure; extract policy-free functions only when they serve more than one call site. Preserve dependency injection and exact status/usage semantics.
3. **OpenAI Responses adapters.** Separate reader-summary, weekly and generic summary orchestration from prompt/schema/parse/content policies. Keep provider-specific types there; share only truly identical support. Verify escaped JSON, refusals, incomplete output, citations, max-token/size and retry behavior.
4. **Agent-runtime and gateway-LLM adapters.** Keep task identities, attestation, output safety, provider/model matching and exact deadline propagation intact. Untangle orchestration from payload/presentation construction without leaking gRPC or gateway types inward.
5. **Deterministic/local and shared support.** Keep fallback behavior and stable evidence order/citations. Make cross-provider code provider-neutral only where semantics genuinely match; reject premature abstraction.
6. **Integration / cleanup.** Update direct consumers, remove obsolete shims and dead exports after checking all references, prevent new import cycles, keep entrypoint contracts stable. Stop and correct regressions before widening to the next slice.

Commit boundaries follow the above subareas; each commit should be independently understandable and contain its own focused regression tests. Do not create a temporary sea of re-export facades to satisfy the LOC target.

## Preimplementation critical review — required 3 rounds

- **Round 1, architecture/SOLID critic:** Are component ownership, import direction, public ports and 10k threshold auditable? Reject synthetic line movement and god abstractions. Update this document with findings and resolutions.
- **Round 2, behavior/security critic:** Can refactoring change prompts, output schemas, attestation, credentials, provider routing, aborts, error classifications, or deterministic fallbacks? Require negative tests and unchanged golden fixtures; update plan.
- **Round 3, testability/operability/review critic:** Can reviewers prove source parity, no circular dependencies, current-main compatibility, focused tests, PostgreSQL + six unit shards and post-merge safety? Require an executable gate matrix and rollback path; update plan.

These rounds must be **completed and recorded here before implementation**, distinguish internal critical analysis from genuine external reviewer approvals. External CodeRabbit/ReviewRouter findings and human reviews are handled later and never misrepresented as approvals.

## Required test and review matrix

- Targeted `libs/summary` Jest unit/contract tests including negative paths for each changed adapter; `npm run build`, `npm run check:architecture`, `npm run check:code-quality`, `npm run check:source-line-cap`, `npm run check:runtime-profile-guards`; affected summary runtime/evidence smoke checks and secrets/contracts where relevant.
- Full exact-HEAD PR CI with all **20/20** jobs, real PostgreSQL 18 and all six backend unit shards, security checks, production lifecycle fixtures and immutable candidate image gate where applicable. Network/runner failures may be retried ordinarily; never bypass a gate.
- Independent PR review: collect CodeRabbit, ReviewRouter and human findings if available; address each actionable finding, respond and rerun affected CI. A missing/partial bot review is *not* approval.
- Reconcile the branch with current main and repeat exact-HEAD qualification. Merge only when scope, ≥10k ledger, code review and all required gates are satisfied; verify post-merge CI and main artifacts. No production deploy.

## Stop/rollback

Keep PR Draft whenever criteria are incomplete. On any behavior change not justified by a separately qualified fix, revert the affected slice (not the entire plan), identify the failing invariant, add a regression, and rerun. Avoid force push, rewriting main, secrets and any destructive operator workflow.

## Review rounds / audit log

### Round 1 — architecture / scope (internal adversarial review)

**Finding A1 (high):** the existing 93-file adapter layer is *already split* by responsibility to a degree. Renaming directories, copying modules, or inserting one-use abstraction layers cannot count as a 10k architecture improvement. **Resolution:** qualification will count source only after a concrete responsibility/dependency improvement is recorded for that file. Keep existing public adapter entrypoints in place when they are the correct composition entrypoints. No mass relocation or hundreds of forwarding facades.

**Finding A2 (high):** `ReaderSummaryModelPort` and `AgentRuntimeClientPort` are inner contracts used by multiple providers; moving provider concerns into a port would invert the dependency. **Resolution:** all transport/parsing/SDK types stay behind concrete infrastructure adapters; preserve ports and domain without changes unless a proven existing boundary violation requires a separate documented decision.

**Finding A3 (medium):** this PR must not collide with active #663/#664 or the deploy fix #620. **Resolution:** implementation writes are confined to `libs/summary/adapters/model` and necessary direct wiring/tests, with an exact-main rebase/reconciliation gate before every final qualification. No staging/source-live or deployment paths.

**Finding A4 (medium):** source byte size is not LOC evidence. **Resolution:** a complete baseline source manifest (excluding `*.spec-support.ts`, `*.fixture.ts`, tests and generated files), dependency map and per-slice unique-original-LOC tally are required before coding. Keep a safety margin above 10k; do not count a trivially unchanged file to hit a quota.

Decision: **conditional pass**; implement only after the inventory and remaining two rounds are complete.

### Round 2 — behavioral/security critic (internal adversarial review)

**Finding B1 (critical):** OpenAI reader-summary, weekly and generic models share plumbing but not necessarily the same refusal/incomplete-output, editorial or citation rules. A universal parser or merged prompt builder would silently broaden acceptance. **Resolution:** keep per-workflow parsers and output shape contracts; extract only byte-for-byte equivalent predicates with direct golden/negative tests. No prompt string, model ID, version or JSON-schema edits.

**Finding B2 (critical):** `AgentRuntimeReaderSummaryModelAdapter`, `GrpcAgentRuntimeClient`, `GatewayLlmClient` and execution-attestation support carry trust decisions about runtime model, task identity, recorded outputs, deadlines and credential-free observability. **Resolution:** map trust boundaries explicitly; keep attestation and fail-closed validation at the current integration point; test mismatched provider/model, missing execution evidence, timeout/deadline and bounded response values before changing shared helpers.

**Finding B3 (high):** the deterministic model is the fallback contract; DRY across deterministic and external models may alter stable evidence selection, order or lineage. **Resolution:** deterministic semantics remain independent; only use shared citation/evidence primitives already contractually identical and compare exact normalized output fixtures.

**Finding B4 (high):** new fixtures can leak private provider outputs or credentials. **Resolution:** use synthetic fixtures and hashed golden values; require `check:secrets`/security CI, never real account flows, test dangerous strings and escaped forms without storing plausible tokens.

Decision: **conditional pass**. The final implementation must preserve strict/negative behavior; remaining round 3 and baseline inventory are prerequisites.

### Round 3 — testability, review and operability critic (internal adversarial review)

**Finding C1 (critical):** a green CI attempt on an earlier commit does not qualify a multi-commit refactor; a draft/plan-only CI success proves nothing about the later model code. **Resolution:** establish baseline tests first; track last changed SHA, then require full *exact-final-HEAD* jobs and final main CI, six native PostgreSQL 18 shards, image/candidate and security. Repeat after fixing review feedback. Transient PGDG/curl runner failures can be rerun normally; never weaken the PG gate.

**Finding C2 (high):** a 10k+ single PR is difficult to review. **Resolution:** keep it single PR per user instruction, but stage coherent commits and explicit per-slice diff, tests, risk, original-LOC ledger and revert plan. Avoid changing generated code, core product workflow, deploy scripts and unrelated formatting.

**Finding C3 (high):** TypeScript exports/import resolution and Jest mocks can break even when runtime snapshots seem equal. **Resolution:** collect before/after public symbol inventory and direct-import consumers; add import boundary tests, run TS build, Jest and architecture/type checks. Avoid transient compatibility facades; delete them before final acceptance.

**Finding C4 (high):** the current working environment can read/write through the GitHub connector but has no network checkout or repository dependencies, so local full tests cannot be honestly claimed. **Resolution:** code delivery can proceed through branch commits, but implementation and E2E completion must be independently verified by GitHub Actions and review. Do not mark a check successful without its exact run conclusion.

Decision: **conditional pass**. The three internal critical rounds are complete, but these are NOT independent CodeRabbit/ReviewRouter/human approvals and are NOT final acceptance. First collect the exact source LOC + consumer inventory, then begin implementation.

**All three internal rounds recorded; pinned baseline inventory complete (84 source files / 15,318 physical LOC). PRE-IMPLEMENTATION GATES COMPLETE. Implementation may now begin, with zero refactored LOC accepted until code/test evidence exists.**
