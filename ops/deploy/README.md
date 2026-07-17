# Production Autodeploy

Production deploys use GitHub Actions plus one forced, project-scoped SSH
command on the Social Monitor droplet. The workflow never receives an
interactive host shell.

## Component policy

- `apps/frontend/**` builds and uploads versioned public/admin web bundles.
- backend app, `libs`, Prisma and root build changes run backend verification
  and rebuild only the affected Compose services.
- shared backend or Prisma changes rebuild all Node services.
- `scripts/**`, `ops/evals/**` and `test/**` rebuild the daily runner only.
- `apps/x-collector/**` rebuilds only the X collector.
- deploy-control changes update the forced command without restarting the app.
- control-only daily launcher or daily service changes activate the versioned
  PostgreSQL runtime control without rebuilding application containers.

The host compares the target commit with durable component markers. It does not
trust only the immediately previous GitHub push, so a delayed or retried run
cannot silently skip an earlier component change.

## Safety model

- only full commit SHAs already contained in `origin/main` are accepted;
- the deploy account is restricted by `sshd` `ForceCommand`, has no password,
  TTY or forwarding, and may sudo only the root-owned deploy entrypoint;
- deploy owns its singleton, daily owns a separate singleton, and both use one
  shared PostgreSQL admission `flock`;
- integration advances only by fast-forward from a clean worktree;
- backend deploys create and validate a managed PostgreSQL custom-format backup first;
- every live PostgreSQL base table must appear in the new dump TOC, while CI
  separately keeps the reviewed backup/restore contract aligned with Prisma;
- only the 10 newest verified `pre-autodeploy` dumps are retained; manual,
  incident, partial and unknown backup artifacts are never pruned automatically;
- previous container image IDs are retained and restored on runtime failure;
- frontend releases are immutable directories switched through symlinks;
- failed frontend health checks restore the previous symlink targets;
- database migrations are forward-only and are never automatically reversed.

## PostgreSQL pool bootstrap

The first bounded-pool rollout must be two main-branch releases. The exact
sorted sets are pinned to 17 Release A paths and 98 Release B paths in
`postgres-pool-release-a.files` and
`postgres-pool-release-b.files`; `verify-postgres-pool-release-contract.py`
makes the split executable for the integration broker, the A-only producer
workspace, and release CI. Release A is control-only. It runs the actual
legacy-main transition twice and does not succeed until the new entrypoint
writes its independent bootstrap marker. Release B is backend-only and is
refused until that marker is proven.

Release A deliberately checks in the PostgreSQL runtime library, Compose
overlay, daily runner, systemd unit, and topology verifier as dormant bootstrap
assets. They let the atomically installed entrypoint be complete before Release
B, but Release A contains no backend-classified path, so it never enters the
backend transaction. It does not advance `backend.sha`, create or switch
`postgres-runtime-current`, install a systemd unit or daily runner, or touch a
running container/runtime. The legacy-main transition test byte-compares those
pre-existing surfaces and their sentinels after every Release A attempt. The
assets become active only when the exact backend-only Release B path set is
accepted after the independent bootstrap marker is durable.

The second release installs `production-runtime` as a versioned control release
and atomically switches `postgres-runtime-current`. The deploy command, boot
unit, and systemd daily runner then use the same Compose overlay. The pool
release does not own a timer; daily-readiness-v6b is the sole timer owner, and
the topology gate requires exactly one effective reviewed timer. Deploy
snapshots the running API's database URL without printing it. After old database
containers stop and before replacements start, the gate queries live PostgreSQL
capacity, reserved/role/database limits, and attributed external occupancy. It rejects operator-only
capacity claims, requires stopped persistent runtime occupancy to be zero,
enforces absolute and proportional headroom, and stops/removes
old DB containers before starting replacements. Previous image IDs remain the
rollback source. The old runtime-control symlink and systemd units are
snapshotted around the complete backend transaction; any backup, build,
migration, replacement, or health failure restores those files and the prior
containers from captured image IDs. A 16-connection read-only held-transaction
probe proves the maximum declared envelope before start. API readiness executes
a real query through the bounded Prisma pool, and deployment holds a five-minute
restart/proxy soak before advancing `backend.sha`. The soak captures per-service
log cursors, runs concurrent direct/proxy readiness, rejects handled SQLSTATE
53300/TooManyConnections/upstream 502 entries even with stable container ids,
and requires an ingestion queue tick with `failed=0`. The release-owned daily script also
refuses to start until its
release SHA equals the durable backend marker, which fences a host crash during
the switch.

## GitHub environment

The `production` environment owns:

- secret `PRODUCTION_SSH_PRIVATE_KEY`;
- secret `PRODUCTION_SSH_KNOWN_HOSTS`;
- variable `PRODUCTION_SSH_HOST`;
- variable `PRODUCTION_SSH_USER`.

Use a dedicated key. Never reuse an operator key or put production secrets in
the repository. Pin every third-party action to a full commit SHA.

## Host paths

- SSH wrapper: `/var/data/social-monitor/control/github-production-deploy-wrapper.sh`;
- root entrypoint: `/var/data/social-monitor/control/github-production-deploy.sh`;
- state: `/var/data/social-monitor/control/deploy-state`;
- upload staging: `/var/data/social-monitor/runtime/deploy-staging`;
- frontend releases: `/var/data/social-monitor/runtime/frontend-releases`;
- integration: `/var/data/social-monitor/integration`;
- backups: `/var/data/social-monitor/backups`.

The entrypoint is installed root-owned. After a successful control deployment,
it atomically refreshes itself from the reviewed copy in the integration repo.
The reviewed `host/` directory contains the exact `sshd` Match block and
sudoers rule. Installation must copy them to
`/etc/ssh/sshd_config.d/social-monitor-deploy.conf` and
`/etc/sudoers.d/social-monitor-deploy`, validate them with `sshd -t` and
`visudo -c`, then reload SSH.

## Deploy-control self-upgrade sequence

The installed entrypoint sources `deploy-control-lib.sh`,
`postgres-runtime-deploy-lib.sh`, and the publication library from the current
integration release before it fast-forwards integration. Runtime-control
changes therefore use an explicit two-release sequence:

1. Deploy a bridge release containing the final entrypoint and deploy-control
   libraries plus the bridge-focused contract test, but no change to
   `production-runtime/daily-run.sh` or
   `production-runtime/social-monitor-daily.service`. Reconcile until
   `control.sha` records the bridge and a new plan reports no pending control
   change.
2. Deploy a final release that keeps the bridge entrypoint,
   `deploy-control-lib.sh`, and `postgres-runtime-deploy-lib.sh` byte-identical
   while changing the reviewed daily runtime assets and adding their final
   race, unit, topology, and workflow gates. The bridge-current process
   classifies those paths and verifies the target controller bytes before
   integration advance, installs the versioned runtime control transactionally,
   verifies the effective unit/topology, and rolls the complete control
   snapshot back on failure.

A target that combines a daily runtime asset with a bridge controller or
PostgreSQL activation-library change is rejected before control activation.
The pool release continues to own no timer; exactly one existing reviewed daily
timer must remain enabled. The daily service timeout is 23,400 seconds with
`Restart=no`, which covers the bounded 7,500-second admission wait plus the
bounded production-day command without systemd starting a duplicate attempt.
