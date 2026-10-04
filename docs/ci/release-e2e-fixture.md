# Disposable release consumer fixture

This implementation is edit/test/handoff only. Synthetic contracts do not qualify
Docker, SSH, PG18, backups or a release. The integration controller runs the actual
harness outside the provider with newly created disposable resources. No account
authentication, production files, customer database, runtime-agent smoke or real
worker/provider execution is part of this fixture.

`ops/ci/release-e2e-driver.py OPERATION fixture.json` emits one finite JSON object.
All controller verbs use real SSH. Native setup uses real Prisma from the exact
immutable candidate on a separate producer daemon, with --network none and the
single disposable TEST PG socket bind. The consumer remains candidate-free until
canonical activation loads the exact received archive. Both daemons must see the
shared TEST input/output parent at identical absolute paths. No host DB/auth mount.
Root's demonstrated c468/PG18.6 recipe passed all103 with zero SQL errors; this
driver still requires independent native qualification.

Driver extracts SQL from that immutable producer image, verifies all names/hashes
against the archive manifest and separately supplied inventory, and stages the
first ten unchanged directories. Real Prisma deploys those as legacy e2e_api.
Initial upstream postgres provisions safe nonsuper e2e_api/e2e_system, separate
NOSUPERUSER CREATEROLE INHERIT migrator, protected daily terminal with exactly
upstream ADMIN/NOINHERIT/NOSET edge and pg_catalog, public search_path, and separate
safe NOLOGIN summary_once. Runtime owns the DB; migrator gets the reviewed CREATE
and ADMIN/NOINHERIT/SET edge. Canonical pre-bootstrap runs as migrator, followed by
the explicit historical publication-owner CREATE window, real full103 Prisma
deploy as migrator, and unchanged post-bootstrap closing/auditing permissions.
Supplied bootstrap hashes must equal both main074 constants and current source.
Final upstream history audit is read-only; restricted observer provisioning is a
separate administrator action. No SQL rewrite, forged history or migrate resolve.
The preliminary server-version query uses postgres before seed creates the migrator.
Unknown finished history expects migration-required; pending/rolled history expects database-evidence.
Temporary negative history rows are inserted only during TEST rejection scenarios,
deleted by exact UUID/name in finally, and the full original history compared.

The services are api, postgres, ssh and three inert named worker sentinels, plus
Redis. API uses synthetic e2e_api and actual bounded Prisma pool2 readiness,
deterministic TEST runtime, in-memory collector and explicitly disabled loops.
The real baseline uses the same c468 API source, distinct immutable image ID and
synthetic revision label, social-monitor.e2e-baseline=true and
social-monitor.e2e-source-sha equal candidate SHA. This proves lifecycle, not
historically deployed dee891 compatibility. Admission later loads
the actual externally built candidate archive into the initially empty consumer.
The default application network remains internal, with no published or exposed
ports on its services. SSH joins only the owned noninternal `ssh_transport`
bridge so Docker29 can publish its random loopback port. SSH accesses PostgreSQL
through the TEST Unix socket and checks readiness through Docker exec. The outer
DIND remains `--network none`, with no host ports or host Docker socket; the child
transport cannot reach the external host. Both network names are checked for
collisions before ownership state is written, and labelled cleanup covers both.
The
SSH fixture uses the exact root-installed release controller, isolated Python and
PyYAML 6.0.3. Its e2e login shell is the unchanged non-setuid static C executor.
It accepts only `-c /usr/bin/sudo -n /opt/social-monitor-release/root-executor`.
Real sshd/PAM/sudo runs the identical no-argument root copy (0700), preserving only
SSH_ORIGINAL_COMMAND before C clears env and invokes copied Python -I -B.
The Dockerfile compiles normally with canonical install flags, without installs.
Missing executor/native observer/hash/version proof
fails closed. A static ELF header alone is not proof of static linkage: the root
installer's static-link/loader-injection checks remain a prerequisite.

Only `/etc/machine-id` inside this disposable SSH container gets the literal core
machine ID. All private core/config/state paths have canonical root-owned ancestors.
The systemctl replacement models only `show` for two fixed synthetic fenced units;
it is explicitly **not real systemd qualification**. Actual non-target container
ID/image/StartedAt/running preservation is checked by the harness and controller.

GitHub/main/jobs/deployed-to-candidate delta/independent compatibility are an
explicit root-owned `synthetic-github-only` authority file, bound to the release and
independently Docker-inspected baseline revision. There is no GitHub token or live
GitHub claim. Database/identity use a real read-only PG18 role/transaction and
`pg_control_system()`. Probe checks HTTP inside the exact Docker target, an actual
Postgres-pool readiness field and target identity before/after. Failed/pending/
rolled-back migration rows remain visible in database evidence.

The fixed TEST bridge imports unchanged operator_database, operator_backup,
operator_probe and native bounded Runner. Its explicit TestConfiguration reuses
pin/recheck methods while leaving production Configuration untouched. It rejects
production system ID and binds the real disposable cluster ID. Root-owned 0600
operator.conf retains canonical shape: version1, database {service:e2e_observer,
database:e2e,role:e2e_observer,host:/var/run/postgresql,port:"5432"},
backup_config_sha256, wrapper_sha256. Fixed service/pass files are synthetic;
empty include directories are checked. There is no invented native.conf ABI.

Private JSON/config reads and unchanged core private_file_digest retain their
16MiB caps. Only the fixed TEST Docker CLI hash/pin permits up to 64MiB, streamed
in 64KiB chunks with canonical root trust, no-follow regular FD and full before/
after metadata checks. All other toolchain files retain a 16MiB hash bound.

The unchanged probe hardcodes the production Compose project. TEST Runner checks
the actual random project label before translating only that label. ID/image/
StartedAt/running, real HTTP and every check remain actual observations. Exactly
one postgres_runtime_pool must have status ok and detail `A query completed through
the bounded shared Prisma pool.` Missing/skipped/duplicates/contradictions reject;
degraded metrics are allowed. Native failure is unready, never invented HTTP200.

Backup uses actual pgBackRest2.59.1 full backup, unchanged info/repo-get/native
checksum proof and repeated info. Repo ID is repo-sha256- plus SHA256 of canonical
JSON {"path":"/var/lib/pgbackrest","type":"posix"}. Manifest checksum is SHA1 over
original ordered JSON values excluding the final repeated backrest-checksum;
manifest bytes also bind SHA256. Actual live PG identity, config hash, label,
timing, database/repo join and manifest are checked. PG image/SSH wrapper UID999
and PG18.6/backRest2.59.1 must match. Only GitHub authority and inactive systemctl
are synthetic; no injectable successful observations.

Root's one-page run procedure (outside the provider):

Canonical controller-private smrel-keep-* tags are allowed; foreign retagging and
consumer build/pull are prohibited. The existing Docker29 graph validator remains
unchanged: manifest image ID differs from config digest. Capture actual source,
daemon IDs/image IDs, archive hash/bytes and toolchain closure before qualification.

1. Prepare a separate producer Docker29 daemon and build/export the candidate
   **once**, single linux/amd64 OCI manifest, no provenance/attestation/tags. Preserve
   its exact manifest/SQL inventory and archive. Prepare separately approved Git SQL.
2. Prepare a reviewed digest-pinned base containing `/usr/bin/docker` 29.x, Compose
   with `--no-env-resolution`, `/usr/bin/psql` 18.x, pgBackRest 2.59.1, SSH, setpriv,
   Python/venv/PyYAML 6.0.3. Populate `build-inputs/native/`, static executor and
   `toolchain.json` in a temporary build context. Toolchain schema: version 1,
   base_image digest reference, exact docker_version/compose_version/python_version,
   files map of canonical installed code/executor/native file paths to SHA256.
   Include every controller file and every native adapter dependency. Build the
   Dockerfile separately; driver never builds/pulls, only canonical retention tags.
3. Prepare a fresh separate outer Docker29 DIND with containerd snapshotter. Listen
   **inside DIND** on `/run/sm-release-consumer/docker.sock`, expose that same Unix
   socket to the root harness at `/tmp/sm-rc-e2e-consumer-RANDOM/docker.sock`. Make
   the harness `/tmp` fixture directories visible at identical paths inside DIND,
   so its bind sources are real owned fixture paths. Run the harness in that outer
   DIND's network namespace so its `127.0.0.1` reaches the consumer's published SSH
   port; the seven inner services never use host networking. Outer DIND ownership/cleanup
   is root's separate scope; it is not one of the harness snapshot services.
4. Preload only the fixed SSH fixture, synthetic labelled Node baseline, PG18 with
   pgBackRest and Redis images on this consumer. Candidate must be absent. Baseline
   needs the same c468 actual API source, labels described above and actual /ready.
5. Write a 0600 prerequisites JSON under `/tmp/sm-rc-e2e-inputs-RANDOM/` with exactly
   version 2, consumer_host, observed consumer_id (`docker info .ID`), producer_host,
   distinct producer_id, full immutable
   fixture_image_id/postgres_image_id/redis_image_id, migration_root, sql_directory,
   bootstrap_directory, toolchain_manifest, toolchain_sha256. All three paths
   must live under that input directory. Producer Unix socket must be under a
   sm-rc-e2e-producer-* directory; root must mount TEST paths identically in both
   daemon namespaces. Bootstrap directory holds original pre/post filenames and
   reader-summary-publication-tenant-ownership.sql for unchanged relative include.
   All fixed image/build/dependency versions/hashes must be independently reviewed;
   this patch deliberately supplies no fabricated image/dependency digests.
6. Run (replace arguments with the root's actual prepared values):

   ```sh
   export DOCKER_HOST=unix:///tmp/sm-rc-e2e-consumer-RANDOM/docker.sock
   export SM_RELEASE_E2E_PREREQUISITES=/tmp/sm-rc-e2e-inputs-RANDOM/prerequisites.json
   : "${RELEASE_E2E_HARNESS:?set the integrated harness path from the helper lane}"
   node_modules/.cicd-tools/node22 "$RELEASE_E2E_HARNESS" \
     /tmp/APPROVED-CANDIDATE ops/release/hetzner \
     "$PWD/ops/ci/release-e2e-driver.py" sha256:FULL_BASELINE_ID
   ```

   Keep DOCKER_HOST set for the **whole harness process**. Driver explicitly passes
   its matched Unix host for every local Docker command; SSH's default socket is
   the mounted consumer-only socket. Do not use a host/default production socket.
   Cleanup removes only this random project's labelled containers/networks/volumes
   and generated SSH keys, including partial provisioning. Keep candidate archive,
   harness evidence and finite controller journal/receipt evidence for review.
   Each daemon independently proves identity and all resource ownership before
   deleting anything there. A producer outage or absent candidate image permits
   verified consumer cleanup, but cleaned remains false with unresolved_cleanup
   until producer cleanup is verified. Require cleaned=true and retry failures.
   The ignored `node_modules/.cicd-evidence/harness.mjs` draft is comparison input;
   run the integrated helper lane's actual harness with corrected module imports.

Root runs python3 -B ops/ci/release-e2e-driver_test.py, sh -n the owned entrypoint,
python3 -B ops/ci/release-e2e-fixture/operator_test.py, and npm run
check:source-line-cap. Native hash tempfile tests require root and use only a
disposable directory under /run. No new Node code is added. The integrated
TypeScript harness must pass its owning lane's meaningful tsc before use.

For a fresh fixture.json use driver operations in this order: provision,
refuse-grammar, refuse-short, refuse-long, refuse-mutated-archive,
refuse-wrong-identity, refuse-archive-drift, refuse-unknown-migration,
refuse-pending-migration, refuse-rolled-migration, activate, reconcile, verify,
rollback, cleanup. Invocation is exactly `python3 -B ops/ci/release-e2e-driver.py
OPERATION "$FIXTURE/fixture.json"` with the whole-process consumer DOCKER_HOST and
SM_RELEASE_E2E_PREREQUISITES set. Create two additional fresh random fixture
directories/projects; provision then auto-rollback on one, and provision then
failed-rollback-latch on the other; cleanup each in finally.

Actual faults disconnect only the observed candidate API's own network, then
optionally the recreated baseline network to force rollback failure. Non-target
identity/state must remain exact. Status must show durable latch and activate
deny latched. Root reconnects only the TEST baseline and actual SSH rollback
reconciles the rolling-back journal and publishes its rolled-back receipt.
The latch remains until fixed TEST owner repair runs canonical receipt
reconciliation/readiness/invariants and removes only the matching latch. There
is no generic recover verb. Reconcile interrupts only journal outcome after an
immutable activated receipt; actual SSH activate reconciles and verify probes.

Keep migration-proof.json, private first10/full103 Prisma logs, actual receipts,
controller-evidence.json and scenario/identity results. On migration failure retain
the first actual PG ERROR, not only Prisma's aborted wrapper. Offline pipe and
raw-checksum regressions cannot qualify the real SSH/Docker/PG/backRest lifecycle.
Cleanup rechecks labels, removes only owned project resources and the two named
producer helper containers, preserves archives/evidence and never prunes images.
