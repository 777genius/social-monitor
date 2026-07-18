# 173. Postgres Connection Pooling

## Status

Locked for database scalability baseline.

## Research Anchors

- PostgreSQL connection settings: https://www.postgresql.org/docs/current/runtime-config-connection.html
- PgBouncer features: https://www.pgbouncer.org/features.html
- PgBouncer documentation: https://www.pgbouncer.org/usage.html

## Decision

Use application-side pools initially, but design for PgBouncer before production load. Connection count is a shared database budget.

## Rules

- Every service has explicit pool min/max.
- Worker concurrency must fit DB connection budget.
- Do not raise Postgres `max_connections` casually.
- API, workers, migrations and admin tools have separate connection budgets.
- Long transactions are monitored and discouraged.
- Background jobs must release connections while waiting on external providers.

## Current Production Budget

The Node processes use one shared `pg.Pool` and one shared generated Prisma
client per loaded process. All connection wrappers in that process lease the
same pair; they do not create a pool per bounded context. The process identity,
URL, pool options and generated-client constructor must match exactly or
construction fails closed.

| Compose service | Entrypoint | Lifecycle | Replicas | Pool min | Pool max | Other connections |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `api` | `apps/api-gateway/src/main.ts` | persistent | 1 | 0 | 2 | 0 |
| `ingestion-worker` | `apps/ingestion-worker/src/main.ts` | persistent | 1 | 0 | 2 | 0 |
| `intelligence-worker` | `apps/intelligence-worker/src/main.ts` | persistent | 1 | 0 | 2 | 0 |
| `delivery-service` | `apps/delivery-service/src/main.ts` | persistent | 1 | 0 | 1 | 0 |
| `event-relay` | `apps/event-relay/src/main.ts` | persistent | 1 | 0 | 1 | 0 |
| `agent-runtime` | `apps/agent-runtime/src/main.ts` | persistent, no PostgreSQL client | 1 | 0 | 0 | 0 |
| `x-collector` | `python -m x_collector` from the control-owned Dockerfile | persistent, SQLite only | 1 | 0 | 0 | 0 |
| `migrate` | `npm run migrate:deploy` | ephemeral | 1 | 0 | 0 | 1 |
| `daily-runner` | release-owned `/control/daily-run.sh` plus control-owned Dockerfile | ephemeral | 1 | 0 | 2 | 1 direct reporting connection |
| none | `apps/social-research-grpc/src/main.ts` | optional | 1 | 0 | 1 | 0 |
| none | `apps/social-research-mcp/src/main.ts` | optional | 1 | 0 | 1 | 0 |

Production does not trust operator environment claims for provider capacity or
reserve. The deploy gate snapshots the running API's effective production
database URL without printing it. After backup and migration finish under the
admission lock, every old database container is stopped and removed. Before any
replacement starts, the gate queries the live server for:

- `max_connections`;
- `superuser_reserved_connections`;
- `reserved_connections` when the server supports it;
- the current role connection limit;
- the current database connection limit;
- current client-session occupancy, split between exact
  `social-monitor/runtime/<process>` application names and unattributed
  external/provider/system sessions.

Admission also requires zero sessions bearing any stopped persistent runtime
identity. This proves container removal actually fenced old pools instead of
mistaking lingering old connections for allowed envelope capacity.

Effective application capacity is the smallest finite role/database limit and
`max_connections` less PostgreSQL-reserved slots. A rendered service containing
old `POSTGRES_PROVIDER_*` or transient-consumer budget variables is rejected as
a stale operator-only claim. The required provider headroom is repository
policy: at least five connections and at least 20% of effective capacity,
rounded up. Both must hold. This is meaningful even on a small DBaaS plan and
scales with a larger live plan.

The admission calculation subtracts external occupancy before applying the
declared maximum envelope and reserve. The verifier accepts only the capture
phase `post-old-container-stop-pre-new-start`. For example,
`max_connections=25`, reserved slots `3`, external occupancy `7`, and envelope
`16` is rejected. Runtime pools set an exact non-secret `application_name`, so
remaining optional repository-owned sessions represented by the envelope are
not double-counted.

Each database service must render an explicit process identity, `min=0`,
approved max and replicas/scale. Missing, malformed or inconsistent values stop
deployment before backup, migration or replacement. Transient consumers are
repository facts: daily auxiliary 1, migration 1, backup 1, capacity
verification 1, one admitted manual group 3, and optional runtimes 2. The gate
calculates these global envelopes from rendered topology and live capacity:

| Envelope | Exact calculation | Application connections |
| --- | --- | ---: |
| steady plus manual/optional | `8 + 3 + 2` | 13 |
| daily plus manual/optional | `8 + 2 + 1 + 3 + 2` | 16 |
| migration plus manual/optional | `8 + 1 + 3 + 2` | 14 |
| backup plus manual/optional | `8 + 1 + 3 + 2` | 14 |
| capacity verification plus manual/optional | `8 + 1 + 3 + 2` | 14 |
| replacement plus manual/optional | `8 + 0 + 3 + 2` | 13 |

The persistent term is `2 + 2 + 2 + 1 + 1 = 8`. Manual and optional
consumers are counted even when the admission lock should exclude them, so a
missed operator serialization does not consume the provider reserve. The
configured manual allowance remains a hard operational ceiling; production DB
commands share the control-owned `daily-run.lock` with deployment and the daily
runner rather than starting a second manual pool group. Daily also takes the
separate `daily-run-singleton.lock` nonblocking, so a duplicate daily exits zero
while the first invocation can announce admission priority. It waits at most
7,500 seconds on `daily-run.lock` and exits with `EX_TEMPFAIL` (`75`) before auth
refresh, Docker, or database work if admission does not become available. The
budget guard scans every direct script pool and centralized script runtime so
one admitted process cannot exceed that three-connection group.

Deployment holds that PostgreSQL admission lock for backup, migration and
replacement, but never retains the daily singleton. Its bounded nonblocking
admission loop probes and releases the singleton before every attempt and
probes it again immediately after admission acquisition. If daily claims the
singleton in that exact gap, deploy releases admission and fails before fetch,
auth-control refresh, Docker, or database work. Deployment also stops and
removes every changed database container,
verifies no old container remains, and only then starts its replacement. Old
and new DB pools therefore have zero overlap; this is enforced rather than
budgeted as a hoped-for rolling-restart assumption. Backup, migration and
replacement remain sequential. The maximum global envelope is 16; deployment
compares it with live effective capacity and the derived reserve policy.

### First pool rollout bootstrap

The installed production entrypoint predates stop/remove replacement. The first
rollout is therefore two releases and the workflow fails closed if they are
combined:

1. Deploy the exact Release A file set in
   `ops/deploy/postgres-pool-release-a.files`. The executable release-contract
   verifier proves that it is control-only. The workflow deliberately invokes
   the installed legacy entrypoint and then the newly installed entrypoint;
   success requires the independent durable bootstrap marker, so the legacy
   `control.sha`-before-sync failure window cannot approve Release B.
2. Only after `plan` reports `postgres_pool_bootstrap=postgres-pool-v1`, deploy
   the exact Release B file set in
   `ops/deploy/postgres-pool-release-b.files`. The new entrypoint takes the admission lock, creates
   a versioned PostgreSQL runtime-control release, atomically switches the
   `postgres-runtime-current` symlink, reloads the checked-in systemd units,
   verifies live capacity, preserves the existing backup, and stops/removes old
   DB containers before starting any replacement.

Previous image IDs are captured before removal. A failed start or health check
retags those images, removes any failed replacement, and starts the previous
containers under their previous configuration. No new pool can overlap an old
pool in either the forward or rollback direction.

The complete backend operation also snapshots the old runtime-control symlink,
the boot and daily units, and the control-owned daily launcher. Any live-capacity, backup, build, migration,
replacement, or health failure restores that control snapshot and every prior
container from captured image IDs. A release-owned daily runner additionally
compares its immutable
`READY` SHA with the durable backend marker after taking the admission lock; a
host crash between control activation and backend commit therefore fails the
daily run closed instead of starting a mismatched pool.

The versioned runtime-control release contains the daily runner Compose
identity/min/max, its exact lock-taking and backend-marker-guarded launcher, the
daily service, and the production boot unit. One symlink switch installs the daily runner topology
with the backend release. Timer creation and enablement remain solely owned by
the daily-readiness-v6b release. The pool release creates no timer and fails
unless exactly one legacy-or-v6b daily timer is enabled. The verifier reads the
effective systemd service and its actual runner, requires the same Compose file
chain used by deploy and boot, and rejects drop-ins. This closes the previous
gap between a hypothetical Compose service and the systemd-triggered runner
without competing with the daily release for timer ownership.

Control-only changes to the daily launcher or daily service activate through
the same snapshot, staged immutable release, atomic file replacement,
`daemon-reload`, effective-topology verification, and rollback path. Their
runtime `SOURCE_SHA` records the control release while `READY` retains the
durable backend SHA, so a control-only activation does not trip the launcher's
backend-compatibility fence. The reviewed daily unit has
`TimeoutStartSec=23400` and `Restart=no`; timer ownership remains exactly one
effective reviewed timer.

Production success is not inferred from process liveness. `/ready` executes
`SELECT 1` through the already-owned bounded Prisma client. Deployment requires
that direct loopback probe and the frontend loopback proxy to return 200, then
holds a five-minute soak in which the exact container ids and restart counters
must remain stable. A failed DB probe, 502, replacement, or restart rolls back
the captured images and runtime-control snapshot before `backend.sha` advances.

Before replacements start, repository-tagged sessions plus up to fifteen
read-only transaction holders and one observer prove all 16 declared envelope
slots concurrently without double-counting a running optional runtime. During the five-minute post-start soak, direct and
loopback-proxy readiness run concurrently. Per-service Docker log cursors are
captured before the soak; handled SQLSTATE `53300`, TooManyConnections, or
upstream 502 log entries fail even when container ids and restart counters stay
stable. Ingestion must also emit a post-cursor scan-drain tick with `failed=0`,
which proves queue recovery rather than process liveness alone.

Worker failure logging walks only a bounded cause chain, preserves safe
SQLSTATE/Prisma classifications, and redacts message text. A Prisma wrapper
whose root message is `unknown` therefore emits an actionable classification
such as `postgres.too_many_connections` instead of losing the database cause.

The read-only 2026-07-14/15 incident baseline is recorded at
`ops/deploy/evidence/postgres-runtime-incident-2026-07-14.json`: managed
`max_connections=25`, 16 observed sessions with one active, API restart count
7, SQLSTATE 53300 observations at 15:52, 20:35, and 00:41 UTC, worker restarts after
RabbitMQ timeouts, and 38 roughly half-hourly ingestion scan-drain failures in
the initial audit followed by another supplied failure at 01:20:33 UTC.
The latest supplied scan-drain evidence still reported retry 2 with
`error=unknown`; Release B replaces that with bounded, redacted classification
and requires a failure-free recovery tick during the soak.
The release proof therefore pins persistent budget 8, maximum envelope 16,
repository ceiling 17, and replacement overlap zero; unit arithmetic alone is
not rollout evidence.

The repository inventory is the union of `Dockerfile`, `docker-compose.yml`,
the production service allowlist in
`ops/deploy/social-monitor-production-deploy.sh`, the installed production
overlays, and `ops/deploy/production-runtime`. Budget tests scan `apps`, `libs`,
`scripts`, and `prisma` (including `prisma/seed.ts`) and fail on any unreviewed
raw `pg`, `PrismaPg`, or generated `PrismaClient` dependency/construction.
Every approved direct pool declares `min=0` and max explicitly; runtime clients
route through the shared factory. The live production deploy gate is
authoritative for effective capacity, reserved slots, headroom, and rendered
topology. Production release CI runs this complete inventory on every backend
release, independently of Jest's changed-file test selection.

## Shutdown Order

Nest teardown must preserve this phase order:

1. Queue and scheduler `onModuleDestroy` hooks stop timers and stop
   fetching new RabbitMQ deliveries.
2. An active delivery finishes. Any already-fetched but not-started deliveries
   are nacked with `requeue=true`; `operation.backpressure` is also requeued and
   is never sent to the dead-letter exchange as a work failure. If an explicit
   nack fails during teardown, the hook still advances to channel close so the
   broker requeues every unacknowledged delivery.
3. `WorkerRuntime.beforeApplicationShutdown` stops admission and drains any active
   operation left after queue quiescence. Its configured drain timeout is a
   warning threshold, not permission to close database resources under live
   work; it continues waiting until the active count reaches zero.
4. RabbitMQ channels and shared Prisma leases close in the application-shutdown
   phase. The final DB lease disconnects Prisma first and ends the one shared
   `pg.Pool` second.

Disconnect and pool-end failures receive at most three immediate cleanup
attempts. A failed pool end retains exclusive registry ownership; a later
acquisition retries that same cleanup before it may allocate a replacement.
Once the external pool is confirmed ended, even a reported Prisma disconnect
failure cannot permanently poison ownership because no database transport can
overlap the replacement. Partial-construction cleanup follows the same rule.
Focused tests assert retry counts, recovery, one-pool diagnostics, and ordering
of old-pool end before replacement creation.

Legacy direct smoke calls to `onApplicationShutdown` delegate to the earlier
hook; production teardown has already completed that component's work before
the application-shutdown phase begins.

## PgBouncer

Use PgBouncer when:

- many pods/workers create too many idle connections;
- scaling API/worker replicas threatens database connection limits;
- managed Postgres offers built-in pooling.

Transaction pooling is preferred for high concurrency, but verify ORM/Prisma/prepared statement compatibility before enabling. Session pooling is safer for compatibility but less efficient.

## Observability

Track:

- active/idle connections;
- pool wait time;
- transaction duration;
- blocked queries;
- connection errors;
- per-service connection usage.

## Best-Fact Choice

Postgres scales poorly with uncontrolled connection fanout. Treat connections like CPU/memory: budgeted, monitored and enforced.
