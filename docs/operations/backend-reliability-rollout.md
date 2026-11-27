# Backend reliability: rollout and qualification

This document covers the bounded recovery changes in
[Draft PR #801](https://github.com/777genius/social-monitor/pull/801).
The PR stays Draft as requested after qualification; neither successful checks
nor this document authorize merge or production rollout. No database migration, new service,
dependency upgrade, pool enlargement or public protocol version is required.

## Deployment compatibility

The EVENT and generic SummaryJob ownership guarantees require all participating
executors to use the new protocol. Old binaries can still perform unfenced writes.

Drain and stop old EVENT relays before starting replacement EVENT replicas.
Likewise drain old generic summary executors, including the polling and queue
drain paths in intelligence-worker, before admitting new generic executions.
Keep a genuinely interrupted RUNNING summary visible for reconciliation; changing
it to REQUESTED merely because time elapsed can repeat paid provider work.

An old process must not resume after the cutover while the new executors run.
A rollback needs the same drain boundary. Stored events, artifacts and jobs use
the existing schema, but schema compatibility alone does not make mixed executor
versions safe. Existing deployment readiness and lifecycle changes in #799 remain
a separate PR. The integration recheck at its head `ceb0ba66` found no changed-file
overlap. The recorded #793, #783, #798 and #800 heads were unchanged; their work
remains outside this PR's scope.

## Resource limits and expected behavior

| Boundary | Default or existing bound | Behavior when capacity or a dependency fails |
| --- | --- | --- |
| EVENT relay | Existing batch limit 1–500; default batch 50 | Claims only due PENDING EVENT rows. |
| EVENT ownership | 30-second renewable lease | Stale owners cannot start or settle a row. |
| EVENT retry | 10 recorded starts; 1-second base, 5-minute ceiling | Retries eligible attempts; exhausted rows become FAILED. |
| RabbitMQ confirmation | 30-second confirmation deadline | Unknown send retires its publication origin; retry can duplicate delivery. |
| RabbitMQ buffer flow | 30-second drain deadline | Confirmed predecessor succeeds; new sends receive backpressure while blocked. |
| RabbitMQ pending publishes | 128 per channel adapter | Excess sends fail admission; no internal payload queue. |
| Bootstrap cache | 128 completed scope entries; 8 active loads; 1 background load | Existing stale data remains usable; excess cold scopes receive existing backpressure. |
| Bootstrap lifetime | 30-second freshness, 5-minute stale window | Timer refresh does not extend user-idle lifetime. |
| Socket replay | One active replay per socket; existing page limit 1–100 | Overlap receives backpressure without queueing another replay. |
| Periodic scheduling | Existing limit 1–100; bounded inspection budget | Continuation advances policy, cadence and historical period. |
| Digest scheduling | Existing limit 1–100 | Scoped due-time/ID continuation advances past failed pages and wraps once. |
| Source-binding page | Existing maximum 100 rows | Catalog data is read in a constant bounded number of queries. |

These are local structural bounds, not a measured production user-capacity claim.
Database pool, broker availability, provider latency and deployment replica count
still determine end-to-end throughput.

## Failure outcomes

**EVENT publication:** a broker failure schedules backoff. A failed ACK storage
write does not manufacture a publish failure or erase a terminal row. The row
retains uncertainty until recovery; stable consumer identities absorb repeats.
The relay can continue with a healthy sibling only after fresh database proof
of that remaining ownership. A failed proof stops further sends.

**RabbitMQ recovery:** publication retirement stops new sends on that origin.
An unsuccessful native close is not proof that acquired deliveries were requeued.
Their captured native ownership remains available for another cleanup attempt;
cleanup does not close a replacement channel or connection.
Terminal recovery cancellation is checked before topology acquisition, preventing
an already cancelled attempt from opening a replacement channel.

**Scheduling:** continuation is bounded process-local progress, not a new durable
scheduler checkpoint. Restart begins another sweep. Failed digest delivery
admission is repaired from the already persisted digest identity without
regenerating its content or advancing the failed schedule.

**Summary completion:** the model call runs outside a short Serializable
transaction. The transaction creates a new artifact, conditionally finalizes the
owned RUNNING job, and creates stable EVENT intent, or rolls all writes back.
Identity collision must preserve the earlier artifact. A lost commit ACK is
reconciled by the intended artifact and scoped terminal job; it does not enter
the model-failure branch.

**Unresolved paid execution:** this change does not add automatic lease stealing
or a provider outcome reconciliation protocol. Existing model-error classification
and FAILED retry policy remain separate from persistence uncertainty. Request,
quota reservation and COMMAND admission are not made atomic by this PR.

**Realtime:** the authorized room is joined before replay. An event may arrive
both live and in replay; the existing client dedupe contract applies. This is
best-effort notification over a durable read model, not exactly-once streaming or
new multi-replica fanout.

## Required qualification

Use the existing Pull request checks workflow on the final combined commit.
A workflow_dispatch run executes its full tier while the PR remains Draft.
A skipped Draft pull-request E2E job is not evidence of execution.

The mandatory evidence includes:

- architecture, lint, TypeScript, source-line cap and backend build;
- full unit inventory with the existing six-shard completeness check;
- full deterministic backend E2E, including native HTTP and Socket.IO regressions;
- RabbitMQ broker E2E using the existing disposable quorum broker;
- the reader-summary delivery PostgreSQL entrypoint, including new EVENT lease
  and atomic generic SummaryJob scenarios;
- existing delivery, RLS, source binding and publication contracts.

Only sandbox fixtures and disposable services are part of this qualification.
Live provider/user production probes are not implied by successful fixture tests.
Record source SHA and actual results; queued, cancelled, skipped or earlier-SHA
runs cannot qualify the final implementation.

## Recorded local qualification

The [2026-11-27 validation record](backend-reliability-validation-2026-11-27.md)
retains commands, source identities and receipts. The concrete local proof includes:

| Evidence | Qualified result | Recorded source |
| --- | --- | --- |
| Fresh complete deterministic backend E2E | 84 unique suites / 176 tests; no failed, skipped, missing or duplicate cases | Reviewed contents committed as `4b2b58d22c00cedef10ccd11d4acd46f92eaae76` |
| Actual RabbitMQ broker and focused transport units | Broker: 3 suites / 9 tests; units: 8 suites / 48 tests | Cancellation fix in `4b2b58d22c00cedef10ccd11d4acd46f92eaae76`; RabbitMQ 4.3.8 / Erlang 27.3.4.1 |
| Four PostgreSQL entrypoints | Ready delivery with EVENT/F1, historical ready recovery, delivery workflow and source-binding status all passed | `05a50fdf0e08d6fd8235c4d647718f85ee6d11cd`; PostgreSQL 18.7 |
| Architecture, code quality and source cap | Full npm aggregates passed; four optional Python PG-profile tests lacked their required URL and were not executed | Node 22.23.5; source cap scanned 6,463 files |
| Exact native-helper dependency inventory | Complete spec: 78 tests passed; explicit fixture paths, unchanged production budgets | `6cdda418101fda17f086ca21eade9e924c3681dc` |

The cancellation, documented-placeholder and exact-inventory corrections received
independent review. The placeholder change keeps the injected error value paired
with its redaction assertion and does not relax the secret scanner. The inventory
change admits only the three reviewed native helpers and does not enlarge runtime
pools or loosen dependency detection. Overlapping test selections are not added
together as an inflated total.

The initial full-unit attempt is triage, not qualification: SQLite availability,
ENOSPC and SIGKILL affected that run. Final full-unit and compiler/build/lint
results require their own successful receipts. Local tenant-RLS and publication
entrypoints stopped before their contracts at a shared Docker-based psql
prerequisite; those local attempts do not establish a pass. The existing CI
environment supplies Docker and retains these checks.

Use the [PR #801 validation and current checks](https://github.com/777genius/social-monitor/pull/801/checks)
as the authoritative final aggregate result for the combined head. This historical
checkpoint neither predicts later CI results nor authorizes a rollout. Keep the
requested Draft status regardless of the check outcome.
