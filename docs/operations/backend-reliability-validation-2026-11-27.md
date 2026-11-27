# Backend reliability validation — 2026-11-27

This is an execution checkpoint for Draft PR #801, not release approval.
The complete deterministic backend E2E inventory passed. Native PostgreSQL,
real-broker qualification and the remaining repository-wide gates are still open.

## Source identity

The qualified executable source is commit `301cbb8ac0ca33425bef866793bc3d1e02c370e7`
(tree `f5a6b5ad5b1591c7171e8863873bfdca6abdc150`).

Tests ran on `9084700f66fdaa05ec08704086e7aa774e5a3094` with exactly two
pending source files: `summary-rest-infrastructure.module.ts` and
`summary-execution-workflow.provider.ts`, both under
`libs/summary/interfaces/rest/`. Commit `301cbb8ac0ca33425bef866793bc3d1e02c370e7`
records those exact tested contents. Subsequent checkpoint changes are documentation only.

The extraction fixes the existing 500-line production-file guard: the composition
module is now 493 lines and the required workflow factory is a separate 41-line
file. Its token, five injected dependencies, adapter selection and null-client
failure remain the same. An independent reviewer accepted the extraction, and
the complete E2E run exercised the resulting Nest composition.

## Executed results

| Check | Actual result | Scope and runtime |
| --- | --- | --- |
| Complete backend E2E | **84 suites / 176 tests passed** | Existing `test/jest-e2e.config.ts`, Node 22.23.5 |
| Scheduler, digest repair and generic summary execution units | 12 suites / 81 tests passed | Existing unit config, Node 24.22.3 |
| Bootstrap cache, query and realtime units | 7 suites / 59 tests passed | Existing unit config, Node 24.22.3 |
| RabbitMQ channel/publisher units | 7 suites / 42 tests passed | Existing unit config, Node 24.22.3; fake transport fixtures |
| EVENT outbox, heartbeat, relay, tenant context and batched reads units | 13 suites / 58 tests passed | Existing unit config, Node 24.22.3 |
| Digest adapter keyset parity units | 1 suite / 3 tests passed | Existing unit config, Node 22.23.5 |
| Core architecture guard | Passed | `node scripts/check-architecture.mjs` |
| Core code-quality guard | Passed after composition split | `node scripts/check-code-quality.mjs` |
| Source/test line cap | Passed, 6,463 files scanned | `node scripts/check-source-line-cap.mjs` |

The focused unit selections are disjoint: **40 suites / 243 tests** total.
Earlier targeted E2E runs (10 suites / 18 tests and 2 suites / 9 tests) are
subsets of the complete inventory and are not added to the 84 / 176 result.
Core architecture and quality guards are not a claim that every command in the
larger npm aggregate scripts completed.

## Complete E2E accounting

Discovery came from the unchanged canonical Jest configuration. It includes
`apps/ingestion-worker/src/reddit-conversation-summary-flow.e2e-spec.ts`
as well as the files under `test/e2e/`.

The final aggregation checked all of the following:

- 84 discovered suites and 84 distinct successfully executed suites;
- 176 passed tests, zero failed, pending or todo tests;
- no missing, unexpected or duplicate suite paths;
- no skipped tests or suites;
- unchanged source and configuration across retained successful receipts.

All qualified E2E receipts use Node 22.23.5 and a clean deterministic environment.
The existing setup file and three deterministic model selectors were retained.
Real HTTP requests and Socket.IO clients were used where the fixtures require them.

The constrained executor intermittently killed processes with SIGKILL before
Jest produced a verdict, including processes with low observed RSS. These attempts
were not counted as passes. Affected files were executed again; successful
receipts were retained once per file and the complete inventory was reconciled.
No assertions, timeouts, test files or discovery rules were disabled to get a pass.

The successful final resource setting used direct Node processes with
`--max-old-space-size=256 --max-semi-space-size=4`; earlier qualified files
used 384 or 512 MB heaps. The test command remained:

```sh
node --max-old-space-size=256 --max-semi-space-size=4 \
  node_modules/jest/bin/jest.js \
  --config test/jest-e2e.config.ts --runInBand \
  --runTestsByPath "$reliability_test_file" \
  --json --outputFile "$reliability_report_file"
```

The detailed local receipts and aggregate
`/tmp/social-monitor-reliability-evidence/backend-e2e-summary.json`
were read and verified before the executor became unavailable. They are local
execution evidence, not uploaded GitHub Actions artifacts. This document retains
the verified compact result; a new CI run must produce its own evidence.

## Native and repository-wide gates still open

| Gate | Exact checkpoint status |
| --- | --- |
| PostgreSQL EVENT ownership, consumer dedupe and atomic generic summary completion | **Unqualified.** PostgreSQL 18.7 and its disposable fixture database started, but the entrypoint received SIGKILL before a scenario verdict. |
| Historical reader-summary recovery PostgreSQL gate | Not reached after the first native gate stopped. |
| Real RabbitMQ broker E2E | Not executed. RabbitMQ 4.3.8 / Erlang 27.3.4.1 were prepared in an isolated temporary directory; no broker pass is claimed. |
| Full unit inventory and six-shard completeness | Not executed locally. The prepared inventory contains 1,398 eligible tracked suites after the existing five exclusions. |
| Full TypeScript check and backend build | Not executed after the environment recovery. |
| Full ESLint check | Not executed after the environment recovery. |
| Entire architecture/code-quality npm aggregates | Incomplete. The Node 24 architecture attempt passed 62 fixture tests and then stopped at a baseline Node flag unsupported by that runtime; the core guards above passed. |

The last confirmed PostgreSQL attempt used Node 22.23.5, the CI transpile-only
and rootDir settings, the unchanged entrypoint/assertions and a 120-second bound.
It reached the original reader-delivery WorkerRuntime, then exited 137 after
9.4379 seconds. Its cleanup trap stopped the disposable server. The next
instrumented attempt lost the execution environment before returning a result.
These interruptions do not establish a PostgreSQL assertion failure or a pass.

The earlier workflow run [45930518717](https://github.com/777genius/social-monitor/actions/runs/45930518717)
targeted superseded commit `c905885a`, remained queued, and was cancelled.
It cannot qualify the current implementation. The PR description links the new
full workflow_dispatch run for the final documentation/source head.

## Review and completion boundary

Independent source review found no remaining reported critical production-code
finding in A–F1. Previously reported ownership, collision, fairness, stale-write
and error-redaction findings were addressed. Executable gates above remain
necessary before changing the Draft/release status.

The [rollout runbook](backend-reliability-rollout.md) retains the old-executor
drain requirement, at-least-once delivery semantics and explicit boundary around
genuinely interrupted paid model work. No production rollout, migration, new
service, dependency upgrade or CI/test-policy relaxation is included.
