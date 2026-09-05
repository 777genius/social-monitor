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

### Temporary production bootstrap Release A

The frozen recovery graph is rooted at
`9adb8eca792c6208c1477576f72487dc4224c4cf`. Release A is its direct child and
keeps all 33 reviewed `apps/frontend` paths byte-identical to that source. It
also retains OpenAPI snapshot blob
`5948d59742978b90e8b884dcec62df4fc72c58d3`. Its temporary CI guard requires
`frontend=false`, `backend=true`,
`backend_base=4bb8f6d4969b8449726a10859202b23e2bfb4366`, `control=true`,
`x_collector=false`, and `postgres_pool_bootstrap=postgres-pool-v1`. Thus A
uploads no frontend bundle and cannot advance the frontend marker; it deploys
the already-reviewed backend and corrected control bytes, then reconciliation
must reach the unambiguous `A-complete` state.

Release B is the direct child of A and changes exactly 34 public paths: the 33
`apps/frontend` paths from `683c6ff94e964a2f268041fda462a2aa1c9eb2e2`
plus `libs/contracts/rest/openapi.snapshot.json` at blob
`e54354c8e7a38a3763af25265a024b619c80b4bb`. The snapshot remains frontend
classified but is excluded from backend classification; adjacent `libs`
paths remain backend classified. After a fresh SSH setup, `inspect-plan` is
the read-only way to require `frontend=true`, `backend=false`,
`backend_base=<Release A>`, `control=false`, and `x_collector=false` before B
is deployed. `plan` remains the workflow action that may perform the narrowly
authorized missing-bootstrap repair. Reconciliation must reach the explicit
`B-complete` state. Its commit message carries exact
`Recovery-A-Manifest-SHA256` and `Recovery-B-Manifest-SHA256` trailers over
the respective full-index commit deltas, so both frozen path/blob manifests
are validated before any production mutation.

One pushed B workflow is resumable from `pre-A`, `A-complete`, or
`B-complete`. It validates the graph and manifests, inspects without repair,
and completes all B verification and the immutable frontend build before it
may deploy A. From `pre-A`, it deploys and reconciles A through the installed
old wrapper, discards the SSH material, opens fresh SSH through A, and requires
the exact read-only B plan. It then uploads B and uses the ordinary deploy
client, whose deploy action reconciles B without replaying a disconnected
mutation. A distinct acceptance job opens another fresh connection and
requires `B-complete`; a replay observes that state and skips both deploys.
The transition guard and its unconditional workflow invocation remain through
B so validation cannot be skipped merely because B is frontend-only.
Publication PostgreSQL verification remains a separate, mandatory CI job
because it is intentionally longer-running.

The first bounded-pool rollout must be two main-branch releases. The exact
sorted sets are pinned to 18 Release A paths and 98 Release B paths in
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

One legacy host state after merged PR #67 may have the exact adoption backend
SHA durable while the independent bootstrap marker is absent and the ordinary
plan still reports the backend pending. Only that byte-exact marker, an
ancestor target with the exact 17-path atomic-repair delta, and an absent
bootstrap marker admit a repair through the existing `deploy` wrapper action.
The sourced deploy library detects that state before taking normal release
locks; its atomic transaction owns both locks and revalidates the complete
state before it stages regular target blobs, verifies modes and digests,
installs only the deploy entrypoint and restricted three-action wrapper, and
writes the target-bound bootstrap marker last. Failure restores both installed
control files and removes all staging and marker changes. It never advances
integration, `backend.sha`, runtime markers, services, containers, images,
subscription runtime files, or running processes. The client then recaptures
the ordinary plan, requires the unchanged adoption backend, target-bound
bootstrap, and still-pending backend, before the normal single deploy action.
This narrow repair is not a waiver in the generic two-release verifier.

The second historical pool release installs `production-runtime` as a
versioned control release and atomically switches `postgres-runtime-current`.
The deploy command, boot unit, and systemd daily runner then use the same
Compose overlay. That historical release leaves timer ownership with
daily-readiness-v6b. A later C1 runtime-control release may transfer ownership
only when its immutable four-line marker is exactly `READY`: while deployment
and PostgreSQL admission are held it stops both timers, re-probes the daily
singleton, proves both services inactive, installs the byte-exact repo-owned
legacy service/timer/runner/marker, and enables the legacy timer at 00:15 UTC.
`BLOCKED` retains the existing reviewed owner, and a READY release cannot
regress to BLOCKED. Normal topology requires exactly one effective reviewed
timer. A canonical persistent containment marker has two phases: `REQUESTED`
durably blocks the runner before mutation, then becomes `CONTAINED` only after
both timers are disabled and inactive and both services are inactive. Both
phases require that zero-timer topology; an invalid marker fails closed. Deploy
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

The final backend release requires a separate dump-capable backup secret at
`/var/data/social-monitor/secrets/db/postgres-backup-admin-url`. The file must
be root-owned, regular, non-symlinked, non-empty, and mode `0400`. Its URL must
authenticate directly to the reviewed production cluster
`dbaas-db-8050451-do-user-39622063-0.e.db.ondigitalocean.com:25060`, database
`social_monitor`, with `sslmode=verify-full`,
`sslrootcert=/run/social-monitor-db/ca-certificate.crt`, and a bounded
`connect_timeout`.

The preferred backup role is `social_monitor_backup_dumper`: `LOGIN`, not
`CREATEROLE`, not `CREATEDB`, not `REPLICATION`, not superuser, and
`BYPASSRLS`. A managed-admin superuser URL is accepted only as an emergency
fallback and is logged as `emergency-managed-admin-superuser` without printing
the secret. Deployment validates the secret path, URL pinning, effective
database, current/session user, live TLS, and dump capability before schema
snapshots or `pg_dump`; a non-capable or invalid existing backup secret fails
before image build or migrations. Temporary user-authorized bypass
`skipped-user-authorized-missing-secret-20260727` applies only when the backup
secret path is absent, in which case deploy emits
`database-backup=skipped-user-authorized-missing-secret-20260727 sha=<sha>` and
continues without reading another backup URL.

The publication migrator remains a separate managed-PostgreSQL login named
`social_monitor_publication_migrator`. Its connection URL lives only at
`secrets/db/reader-summary-publication-admin-url`, owned by root with mode
`0400`. That role is `CREATEROLE` but not superuser, database creator,
replication or bypass-RLS, and its membership in `social_monitor_app` must use
PostgreSQL 18 options `ADMIN TRUE`, `INHERIT FALSE`, `SET TRUE`. It cannot be
reused for backup after `FORCE ROW LEVEL SECURITY`: tenant tables such as
`api_keys` require a dump role with `BYPASSRLS` or superuser capability, and
`pg_dump --role=social_monitor_app`, `--enable-row-security`, table exclusions,
or partial backup waivers are not acceptable.

The pool release continues to own no timer; exactly one existing reviewed daily
timer must remain enabled. The daily service timeout is 23,400 seconds with
`Restart=no`, which covers the bounded 7,500-second admission wait plus the
bounded production-day command without systemd starting a duplicate attempt.

## Exact source handoff after the failed 30cba8fb deployment

`production-exact-source-handoff.py` is an independently reviewed operator
transaction for machine `be0aad971ea647fab370acd110b469b7` only. It stages source
from exact `30cba8fb89c8eaad18ee8c432f9bcbaef9d58040` to exact `origin/main`
T, retaining the product payload and sealed controls of
`350ab58d30d443f29ccbf137debd204dfb60160d`. Only this helper, its regression and
support, this appended section, and the single lifecycle runner hook may differ
from that baseline. There is no intermediate bridge or client/host exception.
The branch API reports `protected:false`; the original incident prompt's
"protected" description was mistaken. Exact SHA/tree, the reviewed inspect plan
and independent root approval supply authority. Do not change branch settings.

Root must independently review the final patch and sanitized production
inventory before use. Confirm every GitHub auto-deploy is terminal and reserve
at least 5 GiB. The helper observes the remote SHA/tree through `gh api`, binds
local origin/configuration, verifies target objects and sets child Git
`GIT_NO_LAZY_FETCH=1`; it never fetches or executes credential helpers. The actual
partial-clone config and harmless pre-commit/pre-push hooks remain intact and
hash-bound. Executable transaction hooks and filters are refused. Root supplies
the already fetched exact T and its reviewed tree. Install the reviewed
helper and unchanged `b0-controller-repair.py` together in a root-owned directory
outside integration, with no group/other write permission. Run Python isolated;
the historical helper's exact SHA256 is verified before it executes. Never load
either helper from an unreviewed target checkout.

Example root commands, after filling the independently reviewed values:

```sh
incident_dir=/var/data/social-monitor/control/exact-source-operator-20260905
incident_target=REVIEWED_FULL_MAIN_SHA
python3 -I -B "$incident_dir/production-exact-source-handoff.py" inspect "$incident_target" > "$incident_dir/inspect.json"
# Review the entire plan: trees, each old/new path/mode/blob, and host identities.
incident_plan_sha=REVIEWED_INSPECT_PLAN_SHA256
python3 -I -B "$incident_dir/production-exact-source-handoff.py" apply "$incident_target" --approved-plan-sha256 "$incident_plan_sha"
python3 -I -B "$incident_dir/production-exact-source-handoff.py" handoff "$incident_target" --approved-plan-sha256 "$incident_plan_sha"
runuser -u social-monitor-deploy -- \
  env SSH_ORIGINAL_COMMAND="deploy $incident_target" \
  /var/data/social-monitor/control/github-production-deploy-wrapper.sh
```

The plan binds the four restrictive 0600/0700 source preimages, actual markers,
each installed control's explicit C2/7e blob, runtime link/READY, idle units,
container identities/images/restarts, credentials and referenced w/y snapshot,
and frontend release/link identities, including the idle weekly unit. It binds
the residual 30 OTel config, accounts for current marker hardlinks and preserves
inert archives, quarantine/rollback directories and retired markers/holds without
recursively inventorying them. CLI databases, WALs, caches, logs and unrelated
workers are outside the credential inventory.
Existing coordination lock files are inspected by inode and ownership, then
locked; their mere existence is not evidence of active work.

Prepare/backups and source completion are durable before handoff. Source staging
executes no target code, hook or service and writes no deployment marker. Before
the durable `ordinary-handoff` receipt, an interrupted recognized old/new source,
index or HEAD state can use the same command with `rollback` instead of `handoff`;
the four original restrictive modes are restored. Unknown bytes, locks or host
drift require investigation. Keep all receipts and artifacts. After handoff,
source rollback is forbidden; the existing wrapper's fresh current=T authority
checks all eleven exact controller blobs, and ordinary deployment owns runtime,
images, migrations, markers and recovery. A failed/idle service is observed as
idle, never described as a successful run.

Offline evidence: `python3 -B ops/deploy/production-exact-source-handoff.test.py`
uses new `/tmp` repositories and real historical Git/host/client guards, with
external observations and physical runtime effects stubbed. Real root can run
the ownership checks directly; non-root uses Linux user namespaces. On GitHub
CI hosts denying unprivileged uid maps, the test runs through noninteractive
sudo in a new root-owned disposable clone, never chowning the caller's checkout
or changing host security settings. `--owned-root-fixture` exercises that same
isolated path explicitly. No ownership assertions are skipped. Also run
`bash ops/deploy/otel-collector-deploy-lifecycle.test.sh` for the unchanged OTel
0644 contract and its 0600/0666/symlink rejection cases. Neither test uses Docker
or network access.

The common Git root may own foreign linked-worktree administration: only its
safe `worktrees` directory boundary is checked, never foreign contents or locks.
Current/common Git locks still refuse staging. Child Git commands suppress
automatic maintenance so the transaction cannot leave background Git work.
Unrelated ignored caches and generated outputs are preserved. Exact changed
paths must match their preimages, new target paths must be absent, and Git
merge/rollback checkout refuse overwriting ignored files even on a late collision.
The five-field terminal transition must identify the activated commit/tree.
An empty idle 0600 legacy auth cursor lock is held and preserved; busy/unsafe
locks and an auth-changed marker still refuse preparation and handoff.
