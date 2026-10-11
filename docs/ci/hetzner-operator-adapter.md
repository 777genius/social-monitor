# Root-owned read-only Hetzner operator adapter

This patch implements six observations consumed by the canonical installed
`Host.evidence`: `preflight`, `release-evidence`, `database`, `postgres-identity`,
`backup`, and `probe`. It does not install anything or authorize a release.
Tests exercise synthetic subprocess responses and real bounded pipes/file checks;
they do not qualify Docker, PostgreSQL, GitHub, SSH or the production repository.

Install only the six `operator_*.py` implementation files alongside the approved
canonical controller modules at `/opt/social-monitor-release`, root-owned regular
files with no symlinks or group/world writes in any ancestor. No ignored evidence
copy, test module, candidate import path or project virtualenv enters production.
The interpreter is fixed at `/opt/social-monitor-release-python/bin/python3` in
isolated mode, and the adapter independently fences the exact machine ID. Provision it independently, root-trusted, using copies rather than
venv executable symlinks; retain the controller's pinned PyYAML 6.0.3 dependency.
The installer/SSH consumer is separate. Its fixed root-owned executable at the
core-configured adapter path must clear the environment **before interpreter
startup**, then exec that fixed interpreter with `-I -B` and the fixed installed
`operator_adapter.py` path. Do not expose arbitrary interpreter/script arguments.
The adapter also clears its environment and uses fixed subprocess executables.

`/etc/social-monitor/release/components.conf` remains the canonical controller
config. `/etc/social-monitor/release/operator.conf` is a separate strict JSON file;
`operator_config.example` deliberately fails until discovery is provisioned.
Config files and every dependency are checked using core `trusted` and
`private_file_digest`; private reads additionally use no-follow descriptors and
byte fingerprints. Inputs are rechecked before returning evidence. Any changed
file, unsupported field/schema, incomplete observation or subprocess failure denies
with the single message `operator-denied`; raw errors, configuration, provider
bodies and decrypted manifests are never emitted. JSON responses contain version
1, a fresh integer `observed_at`, and every validated request binding unchanged.
Input is at most 16 KiB with a five-second EOF deadline; commands share a
150-second budget, each command is at most 30 seconds, and stdout/stderr have
explicit limits. Process groups are killed and reaped at failure/deadline.

Separately provision 0600 regular files at fixed paths:

- `observer.pg_service.conf`: exactly one independently named service containing
  only `host=/var/run/postgresql`, `port=5432`, discovered `dbname` and observer
  `user`, and `connect_timeout=5`. The corresponding operator-config values must
  match exactly. No connection URI, password, runtime API writer role or client
  environment provides authority.
- `observer.pgpass`: libpq password file for that separate observer. The adapter
  never passes passwords in arguments or emits these bytes.
- `github-readonly.token`: a separate root read-only GitHub token. No account-pool
  auth or `gh auth` is read/executed. Provision the token's read permissions for
  canonical repository `777genius/social-monitor` independently.

All paths above are under `/etc/social-monitor/release`. Also provision empty,
root-trusted `github-empty/` and `pgbackrest-empty/` directories there. They close
implicit GitHub configuration and pgBackRest include sources; nonempty directories
deny. There is no configuration-writing command or automatic provisioning.

Both SQL verbs use that exact PG service and a read-only transaction with bounded
statement timeout and catalog-first search path. They observe PG major 18,
`pg_control_system()` system identifier as a uint64 **decimal string**, database,
role and port. The independently provisioned expected system identifier is
`7688442011877063482` for system cluster `postgresql@18-main`. An observer must lack
privileged memberships, table writes, sequence writes, schema creation and database
creation/temp privileges. Independently grant only necessary reads including the
control function. SQL requires the history relation to be a regular table with RLS disabled and
SELECT visibility, then reads **all** Prisma history rows, retaining failed/pending,
rolled-back and duplicate histories as failed evidence. Final candidate migration
names and exact SQL checksums are joined by the canonical controller; no migration,
Prisma, seed or installation commands exist in this adapter.

Backup observation invokes only the reviewed root wrapper
`/usr/local/sbin/pgbackrest-with-cipher-pass`, with explicit config
`/etc/pgbackrest/production-main.conf`, stanza `production-main`, repo `1`, empty
include path, and console/file logging disabled. Cipher handling stays inside the
wrapper. Operator config independently pins complete config and reviewed wrapper
byte SHA256 values. This fingerprint closure covers otherwise unreturned options;
includes, command-specific sections, additional repositories and stanza repository
overrides are rejected. Root review must verify the wrapper passes these exact
read-only arguments and adds only cipher provisioning, with no alternate config,
repository or effects. Unsupported closure requires a separate reviewed change.

Provision core `backup_identity.repository_id` from independent discovery, never
from a release request: `repo-sha256-` plus SHA256 of canonical sorted compact JSON
of `{type,path}` for an explicit `posix` repo, or
`{type,path,s3-endpoint,s3-bucket,s3-region}` for an explicit `s3` repo. The adapter
parses those fields from the pinned private config and recomputes this identity.
It emits only the nonsecret hash. Secrets are excluded from the stable repository
identity; the full private-config hash still binds their immutable configuration.

The selected info entry must be a fresh successful native full, join the exact
`database.id/repo-key` to `db.id/repo-key/system-id/version`, and match live PG.
The exact command `repo-get backup/production-main/<label>/backup.manifest` yields
at most 16 MiB. Native checksum verification follows official pgBackRest 2.59.1
`src/info/info.c` `INFO_CHECKSUM_*`: section/key encounter order, escaped JSON keys,
**raw JSON values**, braces/commas, SHA1, skipping only `[backrest]`'s
`backrest-checksum`. It does not sort/reserialize values or hash invented metadata.
Parsed label, times, database ID, major and system ID must match the selected info;
info and config are reobserved afterward. Receipts contain only the finite native
headers/checksum and actual decrypted-byte SHA256/size, never the manifest.
The independently supplied production proof (785291 bytes, SHA256
`3fdbfa75ac1cde2e5bcc439155ce916e9233b42e7720bc74258f1fc381649be4`, native SHA1
`296352d07dfe3c96bd9a422b0e1248431a8681b5`) is public comparison evidence,
**not** an artifact read or qualified by these synthetic tests.

GitHub uses only explicit GETs via `/usr/bin/gh`. CI must be current-main `push`
on `main`, canonical repository, successful `pull-request.yml`, and exact run ID
and current attempt. Every job page is read through `total_count`, with no missing,
duplicate, skipped or failed job and all current full-CI names including four unit
shards. Main, run attempt, the complete job set and disabled legacy workflow are rechecked. The legacy
`production-deploy.yml` must be `disabled_manually`. Complete, nontruncated Git
Data trees for **deployed revision to candidate** supply the complete delta;
renames are represented as deletion/addition, and modes, symlinks and submodules
participate. `delta_sha256` hashes the sorted canonical list
`[{path,before:{mode,type,sha}|null,after:{mode,type,sha}|null}]`; `paths_sha256`
hashes the sorted path list using canonical controller JSON. Root's independent
`/etc/social-monitor/release/compatibility-review.json` must have exactly version,
base, head, delta_sha256, paths_sha256, independent_review,
all_shared_dependencies_reviewed and compatible, with all review booleans true.
Its actual byte hash supplies evidence_sha256. Missing/stale/mismatched review
always denies. Scope flags derive from that complete delta, and the canonical
controller policy still denies agent-runtime specs; there is no silent exception
or shared-dependency compatibility default.

Probe executes a fixed bounded Node HTTP program via Docker exec in the exact
64hex container ID, with cleared in-container environment. It requires HTTP 200,
status `ok`, service `api-gateway`, and the actual health-reporter
`checks[].name == postgres_runtime_pool` status `ok` with its successful query
detail. A skipped PostgreSQL check denies; degraded metrics remain nonblocking.
No application revision response is required. The adapter fences container
ID/image/start/running/project/service before/after; the controller independently
fences image content/Descriptor/revision. Preflight observes actual legacy state,
SQL history, native backup and the configured API container's readiness.

Focused verification:

```sh
node_modules/.cicd-tools/venv/bin/python3 -B -m unittest discover -s ops/release/hetzner -p 'operator_*_test.py' -v
node_modules/.cicd-tools/node22 scripts/check-source-line-cap.mjs
```

Remaining root qualification: fixed installation/cleared startup, separately
provisioned observer role and all-history visibility, actual PG18 cluster identity,
reviewed wrapper/config closure and repository identity, native decrypted production
manifest checksum/headers and joins, real GitHub pagination/attempt/full-CI coverage,
final independent deployed-to-candidate compatibility review after real E2E,
and exact-container HTTP/probe races. Installer, workflow and SSH consumer are
separate integration work. No production actions were performed by this patch.
