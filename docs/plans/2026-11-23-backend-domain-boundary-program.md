# Social Monitor backend — critical architecture boundary program

Status: **Review remediation in progress; not merge-ready**. Baseline: `main` `c0f3ea3dd2f546ab5fd25f395e341cd2c5093541` (2026-11-22). Owner: `social-monitor` backend. No production deployment authorized.

This document is the reviewable, normative **plan**. Its two companion per-source audit indexes are **non-authoritative scope ledgers**, not mandates to edit every indexed file. A line count is never a proof of changed architecture or working E2E.

Detailed, exact-path baseline and change-admission inventory:

- [Audit index 1/2](2026-11-23-backend-source-audit-index-1.md): baseline source entries 1–1,027.
- [Audit index 2/2](2026-11-23-backend-source-audit-index-2.md): entries 1,028–2,054.

The source-index pair contains **10,290 physical Markdown lines**; with this plan the documented program exceeds the requested 10,000-line threshold. About 2,054 source-file ownership/verification records are **not implementation tasks**. The runtime refactor remains bounded, evidence-driven and much smaller.

## 0. Executive decision

The backend is an existing modular NestJS/TypeScript system with DDD contexts and ports/adapters. The most urgent demonstrable structural defect is **permissive imports across bounded-context domain boundaries**. Fix the admission policy and add executable contract tests **before** rewriting business code. Preserve existing intentional legacy relationships behind explicit path+specifier exceptions that can only shrink. Migrate those exceptions in separate, narrow PRs with behavioral proofs.

This initial PR must **not** change live domain policy, persisted schemas, provider routing, prompts, quotas, event wire representations, NestJS lifetime ownership, retries, lease handling, money/billing accounting, runtime config, production deployment, Flutter, frontend, or existing feature behavior.

**Do not replace NestJS dependency injection with Get Modular.** Get Modular may support a future opt-in host composition capability, only after an ADR proves a concrete missing feature, a single lifecycle owner and rollback behavior.

**Do not introduce new dependencies in this PR.** The social-monitor root still declares TypeScript `^6.0.3`, while the checked upstream source trees use TypeScript 7.0.2 and Node 24.18+/26 for their current packages. Lockfile-safe migration and package-registry verification require a separate upgrade slice.

## 1. Exact external project state and coordination

### Current source references (not claims about npm publication)

- `agent-teams-ai/engineering-foundation`: `@agent-teams/engineering-foundation` repository package version `3.1.0`.
- Feature Module Standard implementation package: `@agent-teams/feature-module-standard` `0.3.2`.
- `agent-teams-ai/get-modular`: `@get-modular/core` and `@get-modular/assembly` `0.8.0`, `@get-modular/effect` `0.1.1`, `@get-modular/conformance` `0.5.2`.
- Those versions were read from repository `main` package manifests, not npm dist-tags. Before adding dependencies, verify registry dist-tags, package artifacts, supported Node/TypeScript ranges and any ESM/CJS incompatibility.

### Existing PR ownership (observed 2026-11-23)

| PR | Ownership | Decision |
| --- | --- | --- |
| #665 | ~741 modified files; Summary model adapter restructuring, 10k original LOC program, conflicts with main | **Do not write to this branch or duplicate its model-adapter changes.** Reconcile/review it separately. |
| #783 | External-beta readiness/evidence group validator | Do not touch those scripts or `package.json`. |
| #782 | External-beta dry-run plan/evidence validation | Do not touch those scripts or `package.json`. |
| #781 | External-beta negative smoke diagnostics | Do not touch those scripts or `package.json`. |
| #776 | Durable backend E2E polling/scheduling | Do not touch its runner, helper modules or `package.json`. |
| #789 | Flutter asset delivery | Frontend is excluded. |
| #620 | Production deploy script | Deployment is excluded. |

The exact list must be refreshed before any merge. An older branch must not overwrite a current-main fix.

### Collision-safe first slice

Allowed changes:
1. `scripts/check-architecture.mjs`: one narrowly scoped cross-context **domain→domain** admission rule.
2. `scripts/check-architecture.test.mjs`: synthetic fail-closed and grandfathering regression tests.
3. This plan and audit companion.
4. No new runtime dependencies, modules, services, APIs, schema changes or provider selection.

Do not edit `package.json` during this slice: other active PRs independently append architecture tests there.

## 2. Baseline proof

- Source audit counted approximately 2,054 non-generated backend production-like TS/JS files under `apps/` and `libs/` after excluding Flutter, test/spec suffixes and common generated roots. This is a tree-based inventory, not an exhaustive semantic classifier.
- Approximately 458 of these are under `features/`. Folder presence alone neither proves nor refutes Feature Module Standard conformance.
- Most notable contexts by source size are `summary`, `ingestion`, `monitoring`, `relevance`, `delivery`, and `social-research`.
- `scripts/check-architecture.mjs` already resolves TS aliases/relative dependencies, forbids inner→outer layer imports and checks production runtime cycles.
- In the current script, the global cross-context restriction applies to **relative** imports and foreign infrastructure adapters; it does not categorically reject a domain importing a foreign domain through a project alias.
- `docs/plans/2026-11-06-legacy-boundary-refactor.md` is historical. Its 15 line-cap exceptions are now **two** on `main` and overlap other open PRs. Do not restart its completed stages.
- The two remaining legacy >1000 LOC sources currently identified are `scripts/capture-durable-backend-e2e-loop.ts` and `scripts/check-external-beta-evidence-runner.mjs`; the former is already owned by #776 and the latter is touched by #781. Neither belongs here.
- No local checkout, locked install, TypeScript compilation or E2E had been performed at the moment this plan was written. Writing tests is not running tests.

## 3. Existing explicitly admitted domain→domain imports

This is a **closed exception set** built from current main source search and checked against each referenced file. Exceptions are exact `(source path, module specifier)` tuples. They are not a generic permission for any imports from the same source context.

| Consumer | Foreign provider |
| --- | --- |
| `conversation/domain/value-objects/conversation-signal-baseline-sample.ts` | `@social-monitor/feed/domain` |
| `conversation/domain/services/conversation-bundle-builder.ts` | `@social-monitor/feed/domain` |
| `summary/domain/policies/reader-summary-github-projection-audit-types.ts` | `@social-monitor/ingestion/domain` |
| `summary/domain/policies/reader-summary-github-archived-projection.ts` | `@social-monitor/ingestion/domain` |
| `summary/domain/policies/reader-post-promotion-v3.ts` | `@social-monitor/relevance/domain/reader-value/reader-value-assessment` |
| `summary/domain/policies/reader-promotion-ranking.ts` | `@social-monitor/relevance/domain/reader-value/reader-value-assessment` |
| `summary/domain/policies/reader-post-promotion-policy-contract.ts` | `@social-monitor/relevance/domain/reader-value/reader-value-assessment` |
| `summary/domain/entities/reader-summary-promotion-order-validation.ts` | `@social-monitor/relevance/domain/reader-value/reader-value-assessment` |
| `delivery/domain/reader-summary-ready-projection.ts` | `@social-monitor/summary/domain/value-objects/reader-summary-period` |
| `delivery/domain/reader-summary-ready-projection.ts` | `@social-monitor/summary/domain/value-objects/reader-summary-scope` |

The exception inventory **is technical debt, not an approved final design**. Each item must be reviewed with the owning contexts before removal. A regression test is required when extracting a shared published-language contract.

Caution: GitHub code-search indexing is not a substitute for the executable full-graph guard on checkout. The first full real `check:architecture` run may reveal omitted baseline edges, which must be reviewed individually and never exempted with a broad wildcard.

## 4. First implementation: ratchet without a domain rewrite

### P1 acceptance invariants

1. A new domain→foreign-domain alias import is rejected even if type-only.
2. A new domain→foreign-domain re-export, `require` or literal dynamic `import` is rejected.
3. A foreign domain deep path and an exported domain barrel are both rejected.
4. Existing exact legacy imports above continue to pass, and only at their exact current file paths.
5. Changing a legacy import to a different foreign module fails, even within the same external domain.
6. Moving an allowed legacy import into another file fails.
7. Ordinary same-domain imports continue to pass.
8. External adapters in composition roots remain legal under the pre-existing rules; this slice must not unintentionally block them.
9. The current architecture tests and runtime cycle detection remain unchanged.
10. The source and test files remain below their 1000 physical LOC cap.

### Implementation decisions

- Reuse `boundedContextOf`, `architectureLayerOf`, `resolveLocalImport`, `importsOf` and the existing `libs/**/*.ts` loop.
- Add a closed, exact set of legacy source+specifier exceptions (not a new dependency or metadata API).
- Decide enforcement from the **resolved file path**, not a fragile raw substring; this also handles regular TS path aliases and project-relative imports.
- Check both static value and type-only edges. Type-only imports do not produce runtime cycles, but do create compile-time architecture coupling.
- Keep the existing previous diagnostics and add one clear new diagnostic for domain→foreign-domain violations.
- Do not reject unrelated dependency edges that were previously allowed; retain this slice's precise scope.
- Do not add a new lint framework, AST parser, workspace graph, flags, CI workflow or generator.

### Synthetic test matrix

| Test | Expected |
| --- | --- |
| new domain aliases foreign domain barrel | REJECT |
| new domain aliases foreign domain deep path | REJECT |
| new type-only foreign domain import | REJECT |
| foreign domain import via `export type` | REJECT |
| literal dynamic import / `require` | REJECT |
| disallowed new deep module from legacy consumer | REJECT |
| permitted exact legacy source + exact alias | PASS |
| permitted one other legacy source + exact alias | PASS |
| same bounded context | PASS |
| inner-layer target / controller / composition previous checks | unchanged |
| framework/runtime cycle existing test suite | unchanged |

### Local and CI qualification

Run on an actual clone with locked project dependencies:

```sh
node scripts/check-architecture.mjs
node --test scripts/check-architecture.test.mjs
npm run check:source-line-cap
npx tsc --noEmit -p tsconfig.json
npm run check:code-quality
```

Then, for final PR readiness, run all project-required checks on **the exact final HEAD**, including native PostgreSQL 18, backend E2E and security gates; do not infer those from isolated synthetics. Only an observed terminal success is PASS. A queued, in-progress, skipped, cancelled or timed-out job is **not** PASS.

## 5. Subsequent architecture program (separate reviewed slices)

### Slice B — published-language boundaries (high priority)

Investigate the listed direct domain imports by related behavior, not by file count:

1. `delivery` consuming `summary` period/scope: design a versioned or otherwise compatible event/published-language shape at the **boundary**, without moving `summary`'s aggregate into a shared kernel.
2. `conversation` consuming `feed` domain: define a consumer-owned signal snapshot and a translation in the integration adapter. Preserve identity, timestamp, scoring and ordering.
3. `summary` consuming `ingestion` historical metadata: define a stable summary-owned evidence/metadata input and convert from ingestion-owned source semantics at an outer edge.
4. `summary` consuming `relevance` reader-value answers: establish an explicit consumer-facing evaluation contract, validate every enum/failure mode and keep ranking semantics byte-equivalent.

Each item requires a separate before/after dependency graph, source contract owner, existing-callsite census, direct negative tests, package compatibility and a targeted full workflow test. **Do not use alias changes as a substitute for decoupling.** Do not copy and diverge enums without an explicit compatibility check.

### Slice C — concentrated use-case orchestration

Candidate: `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case.ts`, about 498 physical lines and 23 constructor dependencies on the baseline. This is a complexity signal, **not proof of a bug**. Avoid rewriting it alongside #665.

Candidate: `libs/ingestion/features/execute-scan/execute-scan.use-case.ts`, about 316 physical lines and 15 constructor dependencies. The scan collection coordinator was previously extracted; do not repeat that work.

Before touching either:
- Trace ownership and side effects in exact order.
- Mark tenant/workspace access, idempotency, lease, retry, success state and external cost.
- Stabilize immutable evidence fixtures and projection order.
- Prefer extracting one independently named responsibility and shrinking the facade; no generic workflow engine.
- If a coordinator cannot be split without changing behavior, document a deliberate nonchange.

### Slice D — uniform architectural tooling

Proposed goal: replace duplicated checks **only when** Engineering Foundation's tool can enforce an equivalent or stronger precise rule and remain verifiably compatible. Keep source-of-truth policy local, no unreviewed widening of exclusions.

Upgrade gate:
1. Confirm actual npm publication/dist-tags and tarball integrity for `@agent-teams/engineering-foundation@3.1.0` and `@agent-teams/feature-module-standard@0.3.2`, or newer versions verified at execution time.
2. Confirm required Node and TypeScript versions.
3. Establish supported toolchain migration scope separately from domain changes.
4. Generate lockfile using package manager, not by manual text editing.
5. Validate CommonJS NestJS host interoperability and CLI behavior under the actual CI Node matrix.
6. Add a repository-specific adoption profile with exact module ownership, rules, exceptions and commands.
7. Verify old guard and new tool give equivalent or stronger judgments against intentionally bad fixture repositories.
8. Keep the old architecture gate until parity is proven and accepted.
9. No blanket auto-generated `features/` directories and no one-module-per-class.
10. Restore E2E and security before merging.

Get Modular Core/Assembly `0.8.0` is an **evaluation candidate**, not an unconditional runtime dependency. Existing NestJS DI is valid composition. Prove one real missing capability, lifecycle and rollback constraints in an ADR and minimal prototype before any adoption. Effect `0.1.1` must not be added merely because it exists upstream.

### Slice E — Feature Module Standard measured pilot

- Choose one small backend context with minimal active PR collision; `usage` or `identity` are candidates, not preselected mandates.
- Map current `domain/features/ports/adapters/interfaces` topology explicitly.
- Set one feature-owned behavior slice and its contracts/adapters/tests without moving unrelated stable code.
- Enforce no new deep cross-feature imports, no cycles and no behavior outside curated roots for the chosen pilot.
- Reject empty ceremonial directories and broad `shared/common/utils` destinations.
- Roll the pilot forward only if real ownership improves and compliance can be proven mechanically.
- If the pilot does not reduce coupling, keep the existing DDD layout.

### Slice F — final integration with existing parallel work

Before integration:
- Refresh all open PR heads and owners.
- In particular, resolve #665 model/projection mismatches against current main (existing comments on model catalog and bodyPreview behavior); do not overwrite updated prompt/model eligibility or provider settings.
- Rebase or merge `main` into the feature branch without force when safe; inspect every conflict manually.
- Preserve the other PRs' architecture test command registrations (especially package.json).
- Run full exact-final-head native checks, not only historical focused test success.
- Review diffs for security, privacy, tenant scope, retries, coverage and accidentally changed generated artifacts.
- Obtain substantive independent review, address each applicable defect and repeat on the resulting HEAD.
- Merge only with branch-protection success and the exact expected head SHA.
- Inspect post-merge `main` results and release/no-deploy state.

## 6. Risk matrix and kill switches

| Risk | Severity | Detection / mitigation | Abort condition |
| --- | --- | --- | --- |
| New boundary guard incorrectly rejects baseline imports | High | snapshot exceptions + actual check | unexplained edge |
| Guard silently overlooks type-only or relative edges | High | synthetic negative tests | test unexpectedly passes |
| Summary reader ranking/output drifts | Critical | avoid behavioral changes in slice A | any output change |
| Scan lease/retry/cursor policy changes | Critical | out of first scope | any changed invariant |
| Dependency/toolchain upgrade causes Nest/ESM incompatibility | High | separate locked matrix | unsupported runtime |
| #665 loses newer main model/provider catalog | Critical | explicit rebase parity | any model/route drift |
| Cross-PR package.json test edits lost | High | exact diff reconciliation | missing test entry |
| Tenant/workspace isolation weakens | Critical | auth/tenant + native Postgres E2E | any leak or skipped coverage |
| Security audit policy weakened | Critical | fail-closed high/critical checks | any bypass/suppression |
| Large refactor inflates lines with moved-only code | Medium | semantic ownership review | size-only completion claim |
| CI queue falsely counted green | High | per-job conclusion and SHA | missing required PASS |
| Production deployment triggered | Critical | PR-only; no deploy permission | any live action |

## 7. Review rounds performed on this plan

These are **author-side critical reviews**, not claims of independent model/human approval.

### Round 1 — SOLID / dependency ownership

Failure in an initial strategy: move all horizontal `domain` and `adapters` folders under `features/`. This would create high-churn imports and likely turn stable domain policies into repeated feature copies. **Correction:** ratchet new edges first; migrate a contract only when behavior and ownership evidence are available.

### Round 2 — reliability / safety

Failure in a naïve strategy: immediately eliminate all cross-context domain references and remove test fixtures in the same diff. This risks breaking ranking, summary publication, external evidence coverage and lease sequencing. **Correction:** exact exceptions retain legacy behavior; no production source changes in first stage; separate behavior-sensitive migrations by owner with real E2E.

### Round 3 — compatibility / dependencies

Failure in a naïve strategy: install today's Get Modular and Foundation with `npm install --latest` and replace NestJS composition. This mixes Node/TS/ESM migrations with business ownership changes. **Correction:** verify registry, Node/TS and installer first; no double lifecycle owner; Get Modular is optional by ADR; Foundation is evaluated as a checker.

### Round 4 — cross-PR conflict / scheduling

Failure in a naïve strategy: edit the existing #665 branch and `package.json` while other agents are actively editing model behavior and architectural test registrations. **Correction:** new narrowly isolated Draft PR based on current `main`, exact-file stage scope, no force pushes, commits published after each standalone change, no CI polling in tight loops, full qualification only when final code stabilizes.

### Round 5 — code quality / measurable outcome

Failure in a naïve strategy: interpret the requested 10k plan-line threshold as a demand to touch 10k runtime lines, or write thousands of speculative tests. **Correction:** plan detail may be exhaustive; code changes must be individually justified, evidence-backed, scoped and nonredundant. The per-source inventory is informational. Do not count documentation, tests, moved-only code or skipped jobs as substantive refactored implementation.

### Review remediation — 2026-11-23

The first independent CodeRabbit pass found three actionable correctness gaps:
- A commented-out static import/export was incorrectly interpreted as executable.
- A foreign-domain `require(/* trivia */ '...')` or `import(/* trivia */ '...')` escaped the new boundary rule.
- One `.e2e-spec.ts` was accidentally listed as production source. It is removed, and both indexes are continuously renumbered to 2,054 records (10,290 appendix lines).

The change is constrained to normalizing comments before the existing dependency extraction and to synthetic regression fixtures. No TypeScript runtime parser or new dependency is introduced, no new production file is changed, and the legacy exceptions remain exact. This is **not a claim of complete TypeScript syntax coverage**: unusual template interpolation and regex-literal grammar still require separate parser-parity review before representing the architecture guard as a general-purpose compiler.

Review proof is code-specific: previous checks on 86ae016a are superseded by the remediation commits. Only full native checks on the latest resulting HEAD can qualify for merge. In particular, `node --test scripts/check-architecture.test.mjs` must distinguish a real import from an inert comment, while `node scripts/check-architecture.mjs` must validate the current repository without creating blanket exceptions.

## 8. Effort and confidence

| Slice | Approximate changed lines | Risk | Reliability target | Confidence in scope |
| --- | ---: | ---: | ---: | ---: |
| A: domain import ratchet + tests + docs | 80–180 code/test (inventory separate) | 2/10 | 9/10 | 9/10 |
| B: four published-language contracts | 1,500–4,500 across multiple PRs | 7/10 | 9/10 with native tests | 6/10 pending callsite audits |
| C: one use-case extraction | 500–1,500 | 7/10 | 9/10 with native tests | 5/10 pending #665 |
| D: Foundation/TypeScript/Node migration | 200–2,000 plus lockfile | 8/10 | 9/10 with matrix | 4/10 pending registry |
| E: feature-standard pilot | 700–2,500 | 5/10 | 9/10 with topology tests | 6/10 |
| F: integration/cleanup | variable, not estimated in advance | 8/10 | required 10/10 qualification | 5/10 |

These are forecasts, **not commitments to edit a fixed number of lines**. Do not optimize for diff size or elapsed CI queue time.

## 9. Exact PR merge checklist

- [ ] Full before/after `git diff --check` on the latest head.
- [ ] Every changed implementation file reread in full.
- [ ] All newly introduced negative architecture test cases pass.
- [ ] Existing architecture and runtime-cycle suite passes.
- [ ] Strict TypeScript build/typecheck passes at pinned repository toolchain.
- [ ] Source-line cap and code-quality gates pass.
- [ ] No new cross-context domain dependencies except explicit reviewed ADRs.
- [ ] No changed output wire contracts, public exports, ORM schema, migrations, prompts, provider selection or security policy.
- [ ] No package.json, npm/pnpm lockfile, deploy workflow, Flutter changes in slice A.
- [ ] Native backend unit shards pass.
- [ ] Native PostgreSQL 18 isolation and feature contracts pass.
- [ ] Backend end-to-end tests pass on exact final code SHA.
- [ ] Static quality, public contracts and security dependency audit pass.
- [ ] Container/deploy lifecycle fixture tests pass without publishing.
- [ ] All required status checks complete SUCCESS (not queued/skipped).
- [ ] Review comments resolved; architecture and security review repeated on final SHA.
- [ ] No changed-file collision with other open PRs without reconciliation.
- [ ] PR becomes Ready only after qualification; protected merge uses exact HEAD.
- [ ] Postmerge main is checked, with no claim of success if pending.

## 10. Immediate stop point

If no real locked dependency installation or CI runner is accessible, it is valid to **push a Draft with implementation and tests but not merge**. Do not invent E2E PASS or substitute code review for execution.

No deployment, production database query, provider API call, real account or externally billable workflow is authorized by this plan. 
