# Summary model adapter refactor — PR #665

Updated: **2026-11-25**. Status: **final review and qualification in progress**.
Use the existing [PR #665](https://github.com/777genius/social-monitor/pull/665)
and branch `refactor/summary-model-adapters-10k-20261108`.

This document restores the original scope and decisions and records the current
completion plan. Historical progress entries remain in Git history and the
[inventory](2026-11-08-summary-model-adapters-10k-inventory.md). The
[original plan](https://github.com/777genius/social-monitor/blob/7b8e6e39e31f05b10463257b6910585398ddb594/docs/iterations/2026-11-08-summary-model-adapters-10k.md)
contains the three original preimplementation review rounds.

## Goal and scope

Separate provider transport, request construction, output admission, evidence
normalization, execution attestation, budgets and orchestration behind the
existing model ports. Preserve observable behavior except for isolated,
reproduced and regression-tested defects.

**In scope:** `libs/summary/adapters/model/**`, necessary direct composition
imports, adapter regressions, relevant E2E and architecture checks.

**Outside scope:** unrelated bounded contexts, Flutter features, database
schema/migrations, dependency upgrades, provider enablement, feature flags,
production deployment and the separate work originally tracked in #620,
#663 and #664. Reconciliation with current main preserves other merged work;
it does not authorize changing that work.

The latest user priority is to finish this existing PR safely and promptly,
review in parallel, fix critical findings, complete E2E and merge. Do not add
further small files merely to increase a counter.

## Architecture decisions and invariants

| Boundary | Responsibility and invariant |
| --- | --- |
| Model port and composition | Preserve public ports and named exports. Configuration enters through existing composition; provider SDK and transport types stay outside inner layers. |
| OpenAI transport and output | Separate HTTP execution, cancellation, decoding, completed-output admission and workflow-specific parsing. Reader, weekly and ordinary-summary policies retain their differing semantics. |
| Agent Runtime and gateway | Preserve task identity, tenant/workspace scope, model/provider matching, attestation, deadlines and bounded retries. Failed or ambiguous paid attempts must not cause speculative replay. |
| Evidence and publication | Provider output cannot invent citation identity or overwrite trusted source metadata. Preserve validation order, normalization, lineage and sealed daily/weekly contracts. |
| Deterministic models | Preserve evidence order, provider coverage, deduplication, no-signal behavior and fallback semantics. Share code only where behavior and reason to change match. |
| Metering and failures | Preserve physical usage across failed and repaired attempts, typed failure classification and credential-free observability. |
| Public compatibility | Keep required historical entrypoints and exact function identities where consumers rely on them. Avoid additional re-export hops, generic factories and hidden I/O. |

Exact prompts, schemas, model defaults, credentials, privacy boundaries and
runtime gates stay intact unless a concrete defect is reviewed and tested.
Keep the hard 1000-line source/test cap and all architecture, security and CI
gates. Use synthetic fixtures and disposable infrastructure; do not run
agent/runtime tests against real user projects.

## Honest original-source accounting

Frozen baseline: `3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba`.
The [position ledger](2026-11-08-summary-model-adapters-10k-positions.json) and
`scripts/audit-summary-model-original-files.mjs` retain their existing rules.

| Measure | Verified result | Meaning |
| --- | ---: | --- |
| Eligible frozen source files | 84 | Excludes tests, fixtures and generated output. |
| Frozen physical lines | 15,318 | Includes syntax, types, comments and blanks; not refactoring credit. |
| Originals changed / unchanged | 78 / 6 | Six unchanged files remain cohesive; changing them solely for credit is unjustified. |
| Machine-verified positions | 5,565 | Provisional unique original implementation coordinates, not independently accepted meaningful LOC. |
| Ownership slices / original files represented | 377 / 74 | No duplicate original coordinate; exact specialist evidence is checked. |
| Maximum positions passing current lexical exclusions | 9,776 | All 84 frozen files, before owner availability, changed-responsibility and semantic discounts. |
| Requested meaningful original LOC | 10,000 | **Not achieved.** |

The 9,776 ceiling was calculated by applying the current auditor's exact
line-exclusion and import-clause rules to every frozen source line, without
requiring a destination owner or a material improvement. Consequently the
current 10,000 target cannot be satisfied within this frozen inventory and
counting rule, even by moving every eligible line. It would require changing
the agreed scope or accounting criterion. This document makes neither change
and does not reinterpret the user's target as achieved.

The existing AST diagnostic reports 9,113 runtime-token candidate lines; it
misses some valid arrow-function, operator and empty-literal constructions and
is not an absolute ceiling. The lexical ceiling above is the relevant upper
bound under the unchanged strict auditor. Added code, tests, formatting,
documentation, repeated moves and physical totals do not increase credit.

The model directory at `482100e2` contains 493 implementation files / 20,892
physical lines: 327 files contain fewer than 50 lines; the largest contains
160. Further splitting increases navigation cost without solving the original
threshold. Preserve useful boundaries and concentrate remaining work on
concrete defects and acceptance evidence.

## Final review rounds

These are independent agent reviews, not GitHub approvals or a substitute for
protected checks.

1. **Architecture and semantic parity.** Compared model entrypoints with current
   main, reviewed OpenAI/deterministic normalization and gateway/runtime
   lifecycles, and checked named exports across all 84 frozen files: none
   disappeared. All six unchanged originals and the four changed originals
   without ledger credit were inspected; no further split was justified.
2. **Failure, security and trust boundaries.** Checked cancellation, retry
   identity, usage, attestation, batch scope, grounded citations and completed
   output. A reproduced OpenAI defect allowed typed input/unknown/reasoning/user
   text to satisfy legacy extractors after completion admission. The regression
   produced 13 failures before the initial correction, published as
   [b1030cfa](https://github.com/777genius/social-monitor/commit/b1030cfa2e040694f95376863e28fa6eed76f712).
   Subsequent review found that this guard also rejects legitimate
   `reasoning_text` alongside generated output. The guard and extraction
   policy are being corrected together; initial regression success is not
   final acceptance of this boundary.
3. **Regression and evidence review.** Re-ran affected suites and checked export
   and source provenance. Initial gateway/runtime review found no reproduced
   P0/P1/P2 in its inspected paths. Additional differential passes compared
   344 ordinary/reader/deterministic cases and 59 weekly cases with main
   `876ea247`: accepted output and rejection contracts matched. A later pass
   found a separate V3 presentation defect: raw JSON parse errors can carry
   provider text into a persisted failure reason. Sanitizing that failure and
   correcting the OpenAI reasoning-text case remain in progress. Both require
   negative regression proof and another review before final acceptance.

## Executed evidence

Counts overlap across targeted runs; do not add them into a unique-test total.
An earlier source pass does not qualify a later production change.
The initial output-admission correction was tested locally and published as
`b1030cfa`; the rows below describe that equivalent patch, before the two
subsequent findings above. They do not qualify the corrections now in progress.

| Surface | Source examined | Executed result |
| --- | --- | --- |
| Gateway, Codex, gRPC, runtime and attestation Jest | `dcd63f6c` | **106 suites / 772 tests PASS** |
| Runtime composition and transport selection Jest | `482100e2` | **1 suite / 42 tests PASS**; model/composition source unchanged from the preceding run |
| OpenAI and deterministic Jest before defect fix | `dcd63f6c` | **117 suites / 721 tests PASS**; subsequent negative repro exposed the missing case |
| OpenAI and deterministic Jest with initial output-admission correction | Patch published as `b1030cfa` | **118 suites / 735 tests PASS**; targeted ESLint and whitespace check PASS; follow-up correction still required |
| Differential ordinary/reader/deterministic model behavior | main `876ea247` vs initial correction's model graph | **344 cases PASS**: 280 accepted, 64 identical rejections |
| Differential weekly strict/legacy normalization | main `876ea247` vs initial correction's model graph | **59 cases PASS**: 12 accepted, 47 identical rejections |
| Backend E2E before output-admission fix integration | `482100e2` | **80 suites / 160 tests PASS** |
| Source provenance | `482100e2` | **5,565 positions / 377 slices PASS**; no 10k acceptance |
| Provenance auditor and AST diagnostic regressions | `482100e2` | **6 tests PASS** |
| Canonical request identity and V3 request boundaries | `482100e2` | **2 suites / 5 tests PASS** |
| Core architecture checker and its Node tests | `482100e2` | Core checker and **56 tests PASS**; full `check:architecture` not yet qualified |
| Final-source typecheck, code quality and full architecture | Final integrated source | **Pending** |
| Protected full PR CI / post-merge CI | Final reviewed source / merge result | **Pending** |

The gateway and OpenAI suites use deterministic outbound provider/runtime
fixtures. Backend E2E exercises application/API boundaries but does not prove
live paid provider behavior or production deployment. Differential runs compare
the two model-source graphs with shared candidate domain/platform dependencies;
they are model parity evidence, not separate full-main E2E. Native PostgreSQL,
broker recovery, immutable image and lifecycle checks remain distinct gates.

Reproduce targeted Jest with `--config jest.config.ts --runInBand` and these
`--testPathPatterns` or `--runTestsByPath` inputs:

- `libs/summary/adapters/model/(gateway-llm/|agent-runtime-|grpc-agent-runtime|codex-reader-summary|reader-summary-(execution|gateway|generation|attested|mimo))`
- `libs/summary/adapters/model/(openai|deterministic)`
- `libs/summary/adapters/composition/reader-summary-agent-runtime-transport.spec.ts`
- `libs/summary/adapters/model/agent-runtime-promotion-presentation-v3-request-boundaries.spec.ts`
- `libs/summary/adapters/model/gateway-llm/gateway-llm-request-identity.spec.ts`

## Completion checklist

- [x] Reconcile current main without overwriting either side: ordinary merge
  [482100e2](https://github.com/777genius/social-monitor/commit/482100e27c70b2fe6a6f9291041d65fe412960b7)
  includes main `876ea247`; 12 incoming main paths do not alter model source.
- [x] Complete the three parallel review lenses and reproduce the output-admission
  defect before the initial correction; record subsequent findings separately.
- [x] Remove 19 temporary model workflows and register all six provenance-auditor
  and AST regression tests in the canonical architecture command, preserving
  required checks: [ea0332d7](https://github.com/777genius/social-monitor/commit/ea0332d71caec58900d901aef0fa1ef087325664).
- [ ] Correct the OpenAI guard/extractor treatment of legitimate reasoning text
  and sanitize V3 JSON parse failures before persistence; prove both fixes with
  negative regressions and another independent review.
- [ ] Integrate those fixes and required E2E additions, push immediately to #665,
  and repeat affected checks on the resulting source.
- [ ] Finish build, TypeScript, full architecture, code quality, source cap,
  runtime profile and affected security/contracts checks.
- [ ] Record the unmet 10k target and its frozen-scope ceiling in final acceptance;
  do not claim it satisfied or silently broaden the work.
- [ ] Complete independent PR review and resolve actionable findings. An absent,
  partial or skipped bot review is not approval.
- [ ] Complete canonical full PR qualification for the final reviewed source.
- [ ] Merge with the reviewed head guard after applicable acceptance requirements
  are met, then verify main and post-merge checks. No production deployment.

Canonical `.github/workflows/pull-request.yml` contains 20 expanded jobs:
static quality, security/contracts, six native PostgreSQL 18 backend unit
shards, backend build/sandbox contracts, backend aggregate, backend E2E, tenant
isolation, promotion canary PG18, feed snapshot PG18, weekly manifest PG18,
Reader Value V3 PG18, immutable candidate, deployment lifecycle fixtures,
production aggregate and Flutter checks. Draft-only preliminary results are
not full qualification. Queued, running, cancelled and skipped jobs do not
count as successful tests.

At review time, GitHub exposed 17 required contexts and main protection applied
to everyone. CodeRabbit skipped the Draft and ReviewRouter's latest attempt
reviewed 0/744 files. There were two author `COMMENTED` submissions, zero
`APPROVED`, and both existing inline threads were resolved. These observations
do not constitute external review acceptance; refresh them for final source.

## Remaining size, risk and rollback

Remaining implementation consists of the two reproduced defects above and any
further concrete findings from their review. Their final production/test LOC
will be reported after integration; the first correction's size is not an
estimate for all remaining work. Existing decomposition is complete enough for
behavioral review, so no volume-driven rewrite is planned.

Current assessment: integration complexity **7/10**, residual regression risk
**6/10** until final-source CI completes, confidence in the reviewed model
boundaries **8/10**. These are engineering judgments, not test results or a
claim that every changed file is independently certified.

If a regression appears, isolate and correct or revert its responsible slice,
add the failing contract case, and repeat affected checks. Preserve other
agents' work and main history; do not force-push, weaken gates or replace
required evidence with queue status.
