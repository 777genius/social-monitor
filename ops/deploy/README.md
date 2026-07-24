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
- backend deploys create and validate a managed PostgreSQL custom-format backup
  before any migration;
- pre-migration coverage is derived from two matching live-schema snapshots and
  two byte-identical lifecycle snapshots of Prisma migration
  `20260716170000_reader_summary_fail_closed_publication`: every public base
  table that exists before migration must appear exactly once in the dump TOC,
  and a full `pg_restore` stream must read the archive before its `.partial`
  file is promoted;
- the publication-table pair may be absent with no history row, or with one
  strictly classified resolved rollback retained as retry evidence. If the pair
  exists, both tables must be in the dump and the reviewed-checksum migration
  must have exactly one completed lifecycle, alone or after that one rollback.
  Partial schema,
  failed, rolled-back, in-progress, duplicate, contradictory,
  checksum-mismatched and raced states fail closed;
- CI separately keeps the reviewed target-schema backup/restore contract aligned
  with Prisma; that target contract does not claim a pre-migration archive
  already contains tables created by the following migration;
- only the 10 newest verified `pre-autodeploy` dumps are retained; manual,
  incident, partial and unknown backup artifacts are never pruned automatically;
- before any backend build, every rollback candidate is pinned to a validated
  immutable `social-monitor-prod-rollback-rescue:<release>-<service>` tag;
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
old DB containers before starting replacements. Validated project-scoped
rescue tags remain the rollback source. The old runtime-control symlink and systemd units are
snapshotted around the complete backend transaction; any backup, build,
migration, replacement, or health failure restores those files and the prior
containers from rescue tags. A 16-connection read-only held-transaction
probe proves the maximum declared envelope before start. API readiness executes
a real query through the bounded Prisma pool, and deployment holds a five-minute
restart/proxy soak before advancing `backend.sha`. The soak captures per-service
log cursors, runs concurrent direct/proxy readiness, rejects handled SQLSTATE
53300/TooManyConnections/upstream 502 entries even with stable container ids,
and requires an ingestion queue tick with `failed=0`. The release-owned daily script also
refuses to start until its
release SHA equals the durable backend marker, which fences a host crash during
the switch.

## Disabled GitHub pre-midnight capture v1

`production-runtime/github-premidnight-capture-v1.sh` is a separately locked,
GitHub-only collection launcher. Its versioned timer is fixed at 23:50 UTC with
one-second accuracy, no random delay, and `Persistent=false`. The exact
`install-disabled-v1` marker admits installation of the launcher, service, and
timer but never enables or starts them. Marker activation fails and restores
the prior capture files if the timer is enabled, either unit is active, an
installed byte differs from the reviewed immutable release, either unit has an
unreviewed drop-in, or rollback cannot be completed. Unrelated launchers and
systemd unit files are byte- and inode-stable during this capture-only
activation.

The launcher accepts no date or provider input. Inside the exact
23:45:00..23:59:59 UTC guard it derives that UTC date, acquires its dedicated
singleton and the shared PostgreSQL admission lock, and runs only
`scripts/run-reader-summary-clean-real-day-collection.ts` in the existing
`daily-runner` image with `--providers github-trending-page` and the explicit
same-day `--date`. AI model selectors are forced to deterministic and the
OpenAI key is blank for this one-shot container. Both the admission wait and
collection timeout are recalculated against UTC midnight, with a finalization
reserve, so this disabled slice cannot overlap or delay the 00:00 production
day. Success also requires the fresh live-collection proof emitted by the
collector. A database-connect fallback to an existing evaluation artifact,
singleton contention, collection failure, output-capture failure, or container
cleanup failure is non-success. Feed persistence continues through the reviewed
Prisma projection and its immutable GitHub observation-conflict checks.

Deploy-control and runtime assets still follow the existing bridge discipline.
Land the controller/library/workflow and dormant assets first, without the
`github-premidnight-capture-v1.activation` marker. Add that reviewed marker in
the separate control-only activation release; the already-installed controller
then versions the complete coherent runtime release while installing only the
new capture launcher and units. Neither release may enable or start
`social-monitor-github-premidnight-capture-v1.timer`; enablement is a later,
explicitly reviewed slice.

## X collector image provenance rollout

The first revision-labelled production X image is an explicit two-release
rollout. Do not combine these releases:

1. Release A contains the deploy controller, X image provenance library,
   fixture tests, workflow gate, and this runbook update. It must not contain
   `ops/deploy/production-runtime/x-collector.Dockerfile`. Reconcile Release A
   until `control.sha` records it and a new plan has `control=false`.
2. Release B adds only
   `ops/deploy/production-runtime/x-collector.Dockerfile`. The Release A
   controller must plan Release B with `backend=true`, `control=true`, and
   `x_collector=true`; CI rejects the Dockerfile release if those durable-plan
   classifications are absent. Release B must keep the Release A controller
   and provenance library byte-identical.

On Release B, the already-running Release A controller authenticates the
tracked Dockerfile as a regular `0644` Git blob, byte-compares the integration
copy with that blob, and atomically installs it as root-owned
`control/x-collector.Dockerfile`. The X image is excluded from the shared
Compose build and built separately with the exact full target SHA as
`SOCIAL_MONITOR_RELEASE_SHA`. Its immutable image ID and exact
`org.opencontainers.image.revision` label are checked before the rescue phase
can advance to replacement. After recreate, the running container must use
that exact candidate image ID and revision before `backend.sha` advances.

A missing, symlinked, mode-drifted, digest-mismatched, unlabeled, or
wrong-labelled candidate fails closed. Candidate failures occur while the
rescue is still in its prepared phase, so rollback restores tags without
recreating the healthy X container. A running image mismatch after replacement
enters the existing exact-image rollback and does not advance the backend
marker. The production canary continues to reject unlabelled or mismatched
images; there is no compatibility exception.

## Backend image rescue lifecycle

The rescue snapshot is a fail-closed prerequisite to every backend build. Each
selected persistent service must have exactly one healthy running container.
Deployment reads that container's recorded `.Image` and pins the image object
under a full-release-SHA, project-scoped rescue tag. It validates that the tag
resolves to the recorded image ID and never falls back to the mutable Compose
`latest` tag for a running service.

One bounded legacy-adoption exception handles Node-service containers whose
still-running root filesystem exists after BuildKit removed their recorded
image object. Only when `docker image inspect` of the recorded `.Image` fails,
deployment requires the container to be running, non-restarting,
non-OOM-killed, and healthy when a Docker healthcheck exists. The live
entrypoint, command, working directory, user, and absent image healthcheck must
exactly match the reviewed legacy Node image contract. Deployment then pauses
the container, streams `docker container export` into `docker image import`,
and rebuilds only the reviewed service-specific entrypoint, direct command,
working directory, and user. It verifies that the reconstructed image has no
`Config.Env`; production environment values and secrets are never copied into
rescue image metadata.
Compose reapplies the reviewed runtime environment and remounts the same
external volumes during rollback. The mutable current tag is never used for
this adoption path. The separately built `x-collector` has no reviewed legacy
reconstruction in this bridge and therefore fails closed if its recorded image
object is missing.

`migrate` and `daily-runner` are explicit tag-only rollback candidates. They
normally have no running container, so their current Compose image tag is
pinned and validated before either tag can be rebuilt. Rollback restores both
Compose tags but never recreates these one-shot containers: database migrations
remain forward-only, and the control-owned daily runner starts only through its
separate singleton/admission path.

The atomically completed rescue manifest and its mode-`0600` phase record
survive process interruption and are reused unchanged when the same release is
retried. The phase is `prepared` until immediately before the first service is
stopped or force-recreated, when it atomically becomes `replacement-started`.
Preflight, backup, build, and migration failures therefore restore only Compose
tags and never stop or recreate healthy containers. After replacement starts,
rollback restores tags, recreates and verifies the captured persistent services
once, then durably records `rollback-complete`; an outer retry caused by a
separate runtime-control rollback failure cannot repeat the container rollback,
and a same-release retry cannot reuse the restored rescue as a fresh snapshot.
An interrupted or incomplete non-`prepared` rescue blocks a new runtime-control
snapshot so the original rollback evidence remains available for operator
recovery.

A partial manifest cannot reach the build phase; HUP, INT, TERM, or the next
locked deploy removes only that release's deterministic rescue tags. A failed
release always attempts both backend image/container restoration and PostgreSQL
runtime-control restoration, reports both failures, and retains rescue tags if
either rollback is incomplete. Exact rescue tags and their state are removed
only after the backend marker commits a successful release or after both halves
of rollback complete. No Docker prune is used, and images or tags owned by
other projects are never selected for cleanup.

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
- tracked X Dockerfile destination:
  `/var/data/social-monitor/control/x-collector.Dockerfile`;
- backups: `/var/data/social-monitor/backups`.

The entrypoint is installed root-owned. After a successful control deployment,
it atomically refreshes itself from the reviewed copy in the integration repo.
The reviewed `host/` directory contains the exact `sshd` Match block and
sudoers rule. Installation must copy them to
`/etc/ssh/sshd_config.d/social-monitor-deploy.conf` and
`/etc/sudoers.d/social-monitor-deploy`, validate them with `sshd -t` and
`visudo -c`, then reload SSH.

## Deploy-control self-upgrade sequence

The installed entrypoint sources `deploy-control-lib.sh` and
`postgres-runtime-deploy-lib.sh` from the current integration release before it
fast-forwards integration. A backend-classified target is then required to
provide a reviewed, regular, non-symlink publication library inside the
fast-forwarded integration tree. The bridge verifies that file against the
target Git blob, sources it, and requires its publication-migration entrypoint
before any runtime-control snapshot or activation. While the target SHA remains
dynamically scoped, that authenticated publication wrapper rejects a preloaded
backup entrypoint and independently binds the target PostgreSQL backup library
to its fixed canonical path, root owner, exact Git/filesystem mode and reviewed
Git-blob digest before sourcing it. It then replaces the installed controller's
legacy inline backup function, so the first migration release uses the hardened
contract without changing any installed bridge file. Runtime-control changes
therefore use an explicit two-release sequence:

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

The final backend release also requires a dedicated managed-PostgreSQL login
named `social_monitor_publication_migrator`. Its connection URL lives only at
`secrets/db/reader-summary-publication-admin-url`, owned by root with mode
`0400`, and is pinned to the reviewed cluster, port, database, CA path and
`sslmode=verify-full`. The login is `CREATEROLE` but not superuser, database
creator, replication or bypass-RLS. Its membership in `social_monitor_app`
must use PostgreSQL 18 options `ADMIN TRUE`, `INHERIT FALSE`, `SET TRUE`.
Deployment validates that exact identity and live TLS session before creating
a backup or building an image, then validates it again immediately before the
first publication SQL transaction. Only transient connection failure is
retried, three times; identity, URL and privilege mismatches fail immediately.

The pool release continues to own no timer; exactly one existing reviewed daily
timer must remain enabled. The daily service timeout is 23,400 seconds with
`Restart=no`, which covers the bounded 7,500-second admission wait plus the
bounded production-day command without systemd starting a duplicate attempt.
