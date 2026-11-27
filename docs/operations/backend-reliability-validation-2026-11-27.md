# Backend reliability qualification — 2026-11-27

This record preserves the executed local evidence for Draft PR #801. The final
repository-wide unit, compiler and GitHub Actions verdicts are maintained in the
[PR validation table and checks](https://github.com/777genius/social-monitor/pull/801).
A queued, skipped, interrupted or earlier-source run is not a completed check.

The requested deliverable remains a Draft PR. Fixture qualification does not
authorize a merge or a production rollout.

## Source identity

The latest production source is recorded in
`8b373a1b1b2131688acba7253dc7de92e4f929fd`. Its final delta adds a native
30-second RabbitMQ connection inactivity timeout and five regression cases.
Focused RabbitMQ units and real-broker E2E passed on those exact file hashes;
the repository-wide qualification for this source remains in the PR checks.

The earlier complete E2E and real-broker runs used a physical source snapshot with
exactly the contents of `4b2b58d`. Its four-file candidate manifest was identical
before and after execution. Root independently compared every path changed since
`05a50fdf` with the synchronized checkout at `6cdda418`, which adds only the exact
native-fixture inventory test update. These earlier results are identified
separately from the new handshake regression and final CI.

The earlier composition extraction is recorded in
`301cbb8ac0ca33425bef866793bc3d1e02c370e7`: the module is 493 lines and
its required workflow provider is 41 lines. Independent review confirmed the
same token, five injected dependencies, adapter selection and null-client failure.

No package, lockfile, Jest configuration, existing test timeout, schema or CI
policy was changed for these checks. The added real 30-second handshake test has
its own 45-second test budget and a 35-second peer cleanup guard.

## Executed local evidence

| Check | Actual result | Scope |
| --- | --- | --- |
| Complete backend E2E before the handshake fix | **84 suites / 176 tests passed** | Source `4b2b58d`, Node 22.23.5; unchanged canonical E2E configuration |
| Latest-source complete backend E2E attempt | **Interrupted; unqualified** | Worker SIGKILL before assertions under shared-host memory pressure; final canonical CI is required |
| Real RabbitMQ E2E after the handshake fix | **3 suites / 9 tests passed** | Exact `8b373a1` source; RabbitMQ 4.3.8, Erlang/OTP 27.3.4.1, Node 22.23.5 |
| RabbitMQ units and existing terminal recovery cancellation | **8 suites / 53 tests passed** | Exact `8b373a1` source; all seven B unit suites plus the unchanged recovery cancellation suite |
| EVENT/F1 native delivery gate | **Passed** | PostgreSQL 18.7, Prisma 7.9.1, Node 22.23.5 |
| Historical EVENT recovery native gate | **Passed** | Same native runtime; immutable evidence, fenced recovery and ACK uncertainty |
| Existing delivery-workflow PostgreSQL gate | **Passed** | COMMAND ownership, rollback, renewal, stale settlement and workspace isolation |
| Existing source-binding-status PostgreSQL gate | **Passed** | Resume quota, receipt replay, rollback and concurrent resume |
| Exact database-pool fixture inventory | **1 suite / 78 tests passed** | Three explicit native helper paths registered; production budgets unchanged |
| Full secret scan | **Passed** | Complete synchronized checkout at `6cdda418`; unchanged scanner and allowlist |
| Changed smoke entrypoints | **All passed** | `check:event-store`, `check:event-relay`, `check:monitoring-persistence` |
| Complete architecture npm aggregate | **Passed** | 247 TAP test executions, zero failures or skips |
| Complete code-quality npm aggregate | **Passed** | Source guard, production-lifecycle typecheck/test, Telegram Python and shell checks |
| Source/test line cap | **Passed** | 6,463 files scanned against the existing 1,000-line cap |
| Earlier full TypeScript check | **Passed on `9f3d3ae` equivalent source** | TypeScript 6.0.3, 6,659 files; final aggregate status belongs to the PR checks |
| README-preview typecheck | **Passed** | Existing isolated subproject with its locked TypeScript 7.0.2 |

The code-quality aggregate's existing Telegram Python suite reports 37 tests:
33 execute and four optional native PostgreSQL tests are skipped without their
explicit isolated database URL. Those four skips are separate from the complete
backend E2E result, which has zero skips.

Earlier focused unit selections passed 40 disjoint suites / 243 tests. They
overlap with subsequent RabbitMQ and integration verification, so these totals
must not be added together. The original targeted E2E selections also overlap
with the full 84-suite inventory.

## Complete backend E2E accounting

Discovery came from the unchanged `test/jest-e2e.config.ts`. It includes
`apps/ingestion-worker/src/reddit-conversation-summary-flow.e2e-spec.ts`
as well as the suites under `test/e2e/`.

The completed canonical run on `4b2b58d` and its independently checked JSON report
show:

- 84 discovered and 84 distinct executed suites;
- 176 passed tests and zero failed, pending or todo tests;
- no missing, unexpected, duplicate or skipped suite paths;
- unchanged candidate and configuration hashes before and after execution.

The existing deterministic setup and synthetic CI environment were retained.
The scenarios use real HTTP requests and Socket.IO clients where applicable.
Node 22.23.5 ran one recycling worker; the CLI resource settings were:

```sh
node --max-old-space-size=768 node_modules/jest/bin/jest.js \
  --config test/jest-e2e.config.ts \
  --maxWorkers=1 --workerIdleMemoryLimit=384MB \
  --json --outputFile="$reliability_e2e_report"
```

Jest completed in 69.85 seconds, with a maximum reported heap of 437 MiB.
This run supersedes the earlier resource-constrained per-file aggregation for
that production source.

After the handshake fix, one additional complete run used Node 22 with a 256 MiB
heap, a 4 MiB semi-space and one worker recycling at 192 MiB. Multiple workers
received external SIGKILL before assertions. The attempt was stopped and its
partial logs retained; it is not a completed or passing E2E result. No test,
timeout or discovery rule was weakened. The final-source aggregate result belongs
to the canonical CI checks linked from the PR.

The local evidence bundle contains discovery, raw execution JSON, source/config
hashes, a compact summary, and a proof listing all suite/assertion verdicts.
These local receipts are distinct from artifacts produced by GitHub Actions.

## Native failure and recovery proof

The unchanged native entrypoints used disposable PostgreSQL 18.7 and the locked
Prisma 7.9.1 client:

```sh
npm run check:reader-summary-ready-delivery-postgres
npm run check:reader-summary-ready-recovery-postgres
npm run check:delivery-workflow-postgres
npm run check:source-binding-status-postgres
```

The first pair used the same transpile-only/rootDir environment as its CI step.
The second pair used the default typechecking entrypoints without those overrides.

The EVENT/F1 scenarios prove concurrent bounded claims, row-lock expiry fencing,
renewal, retry exhaustion, stale-owner rejection, consumer rollback/dedupe/RLS,
healthy sibling progress after an isolated storage fault, systemic-failure stop,
and atomic artifact/job/EVENT completion. Summary scenarios include concurrent
claims, row-version ownership, identity collisions and lost completion ACKs.

The historical recovery gate also proves immutable supersession, microsecond
`xmin` compare-and-set, concurrent writers, durable consumer replay, uncertain
confirmation/DB outcomes and preservation of the no-resend boundary.

The existing delivery and source-status gates independently cover COMMAND/delivery
ownership and quota/receipt transactions. They are not substitutes for the separate
full tenant-RLS and reader-publication CI gates.

The real broker was RabbitMQ 4.3.8 / Erlang 27.3.4.1, verified by an actual AMQP
handshake. The unchanged `test/jest-broker-e2e.config.ts` passed all three suites
and nine tests. They cover topology loss/reconnect, mandatory returns, concurrent
confirmed sends, redelivery, poison metadata and captured-origin delivery cleanup.
All owned broker and PostgreSQL processes were stopped after their runs.

The handshake regression also uses an actual local TCP peer that accepts the
AMQP protocol header but sends no response. Default options reject with native
`connect ETIMEDOUT`; an explicit short timeout allows two distinct failed
connections, proving that rejection releases acquisition for a fresh attempt.
Socket/TLS options and an explicit zero timeout are preserved without mutating
the caller's object. This is amqplib's socket inactivity bound during connection
establishment, not an absolute deadline against continuously arriving bytes or
a timeout for subsequent channel RPCs.

## Findings from full-inventory triage

The broad local unit run used the canonical 1,398 eligible suites: 1,403 tracked
unit candidates minus the existing five exact exclusions. It found three
integration issues, all corrected and independently reviewed:

1. **Terminal recovery cancellation:** reasserting topology after close could open
   a new connection before the send guard rejected a cancelled publication.
   Reusing the existing guard at channel acquisition fixes this with one line.
   All five originally failing cancellation phases now pass unchanged; ordinary
   reconnect and captured-delivery cleanup still pass on the real broker.
2. **Synthetic credential literals:** three new test files used values outside
   the existing documented placeholder policy. Values were replaced with
   `token-value` / `raw-password`, with redaction assertions preserved. The
   complete original secret scanner passes; no exception was added.
3. **Native fixture inventory:** the exact raw-dependency list now names the
   three added EVENT/summary helpers. They borrow the gate-owned pool and close
   temporary clients; summary contention uses two independent max=1 registries.
   Runtime budgets, constructor detection and production import restrictions
   remain unchanged. The complete inventory spec passes all 78 tests.

The same triage run encountered an absent SQLite CLI, temporary-filesystem
exhaustion in a real local clone fixture, and a killed worker. It was stopped and
is not counted as complete unit qualification. SQLite was restored from official
checksum-verified packages with its matching native library. Final execution uses
isolated temporary space and preserves the existing discovery and completeness
checker. Its actual six-shard result is recorded in the PR validation table.

## Canonical CI and execution limits

The final full `Pull request checks` workflow is dispatched on this branch while
the PR stays Draft. Its exact run link, source SHA and result are recorded in the
PR description. A Draft job that the workflow skips is not E2E evidence.

Two historical native gates call a pinned Docker/psql regression fixture:

- `check:tenant-rls-postgres`;
- `check:reader-summary-publication-postgres`.

The local executor has no Docker CLI or reachable Docker Engine. Their local
attempts stopped at that prerequisite and do not qualify either gate. The
standard CI environment provides the required runtime. No Docker shim, weakened
fixture or replacement database role was used.

Monolithic local compiler/lint attempts also received SIGKILL under shared-memory
pressure. Earlier TypeScript success and resource-interrupted later attempts are
reported separately. Final compiler, build, unit-completeness, security, native
and release-fixture outcomes must be read from completed checks for the qualified
source; no interrupted attempt is promoted to a pass.

## Review and rollout boundary

Independent reviews accepted the ownership, collision, fairness, stale-write,
redaction, cancellation and final handshake fixes. The last review traced the
silent-peer failure through relay acquisition: the current tick and its claim
heartbeat could remain active indefinitely, while the worker shutdown warning
did not cancel the pending connection. The native timeout fixes that default
path without introducing another retry state machine or internal payload queue.
The final aggregate checks remain part of acceptance even when source review has
no outstanding reported critical finding.

The [rollout runbook](backend-reliability-rollout.md) retains the old-executor
drain requirement, at-least-once delivery semantics and the explicit limit around
genuinely interrupted paid model work. Schema compatibility does not make mixed
old/new executors safe. Production deployment and provider/user probes are
outside this Draft PR's authorization.
