# Hetzner API release controller (bounded PR3 remediation)

This scope implements host admission and API-only state transitions with Python, pinned PyYAML
structural admission and synthetic subprocess proofs. It is **not production qualification**.
The separate trusted adapter (PR5), Docker 29 export/load/E2E, PG18, SSH, GitHub
and host shellcheck qualification belong to the main/operator lanes. No provider,
production operation, candidate program or migration was executed here.

## Trust and installation

Only machine `b28fc7b17042414386eb9b114046e50c` is authorized. Install
`controller.py`, `contract.py`, `archive.py`, `bounds.py`, `evidence.py`, `host.py`,
`compose_contract.py`, `requirements.txt` and executable `release-gate.sh` under `/opt/social-monitor-release`, root owned,
without symlinks or group/world writes. Never install test files/fake adapters.
An operator separately provisions root-owned `/etc/social-monitor/release/components.conf`
and its executable adapter. The example has deliberately invalid discovery
placeholders. Unknown inputs fail closed. Never use candidate Compose/env files.

Provision state/inbox/admissions/imports/transactions/receipts/overrides directories
0700 and `controller.lock` 0600; code/config paths must meet `trusted()` checks.
Select the actual trusted Compose overlays/env-file **paths**, project, non-target
container names, writer services/timers and candidate migration root independently.
Use Python 3 and Compose with `--no-env-resolution`. The gate uses only the fixed
`/opt/social-monitor-release-python/bin/python3` interpreter, in isolated mode
with a cleared environment. Provision that interpreter and all its dependencies
root owned, without group/world writes, outside every candidate/project directory.
Install official PyYAML 6.0.3 using the hash-pinned `requirements.txt`, never
from a candidate package, interpreter, import path or requirements file:

```sh
# Operator installation, from the independently reviewed root-owned lock.
/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/python3 -m venv /opt/social-monitor-release-python
/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/social-monitor-release-python/bin/python3 -I -m pip install --require-hashes --no-deps -r /opt/social-monitor-release/requirements.txt
```

The lock accepts the official 6.0.3 sdist and CPython 3.12 manylinux x86_64 wheel
verified against PyPI by the integration operator. Other wheels require independent
hash review before extending the lock. No packages are installed by the gate.
Missing parser or version drift fails closed before any activation/rollback up.
The archive validator itself remains stdlib-only. A fixed restricted SSH
executor must discard caller environment (including shell/loader variables)
before Bash, preserve only `SSH_ORIGINAL_COMMAND`, and invoke the gate. Use a
separate pinned host key and `StrictHostKeyChecking=yes`; no generic shell sudo.

## Eight verbs and archive contract

```
status
preflight
receive <40hex-sha> <ci-run-id> sha256:<archive-64hex> sha256:<docker-id-64hex> <bytes>
admit <sha> <ci-run-id>
activate <sha> <ci-run-id>
verify <sha> <ci-run-id>
rollback <sha> <ci-run-id>
receipt <sha>-<ci-run-id>[-rollback]
```

Receive takes an exact binary byte count and EOF, with a single 120-second
monotonic deadline for both. It takes a nonwaiting host flock, checks disk space,
byte SHA256 and archive content, and publishes immutable import metadata. No
Docker load/create/up or candidate execution happens before admission.

Preferred CI output: build **once**, `--provenance=false`, single linux/amd64
platform OCI manifest; export that exact Docker ID tag-free. Docker 29 saves with
`blobs/`, `blobs/sha256/`, `index.json`, `oci-layout`, `manifest.json` and gzip
layers are supported. Docker ID is the platform manifest digest; config SHA256
is a distinct verified graph node. Exactly one descriptor must point to the
manifest; config/layer digest, size, media type, platform and uncompressed
rootfs diff_ids are verified. Candidate indexes, attestations, multiplatform
and other compression/media types are explicitly unsupported. Index-rooted
**existing baseline** IDs remain valid through independent Docker inspection.
Classic tag-free saves use an explicit config-digest identity mapping with
uncompressed layers and no Docker Descriptor. Loaded modern Descriptor must
match the verified root digest/media type/size. Both revision and CI-run labels
must match. The entire immutable graph persists in admission and receipts.

Outer/inner GNU/PAX sparse data is rejected by physical header scanning before
logical expansion. Limits: 2 GiB per member/decompressed layer, 8 GiB total
layer bytes, gzip expansion <=100x (64 KiB minimum allowance), 10,000 outer
members, 100,000 physical headers total, 64 KiB metadata record/4 MB metadata
total, 4096-character paths and a 120-second total processing deadline. Gzip optional headers (name, comment,
extras and header CRC) share the bounded metadata limits and are parsed before
raw zlib decompression; CRC, trailer and uncompressed digests remain mandatory.
A short-lived isolated stdlib validator subprocess is killed and reaped at the
processing deadline, covering blocking I/O, JSON/tar parsing and hashing as well
as decompression. It executes only installed controller code, never a candidate. Private
bounded layer spooling never extracts candidate paths. Traversal, outer links,
duplicates, foreign tags and links under/above the migration root are denied.

## Independent adapter evidence (PR5 contract)

All responses are JSON `version:1` with fresh integer Unix `observed_at`, and
must repeat every request field exactly. Standard requests bind `sha`, string
`ci_run_id`, `archive_sha256`, `image_id`. Adapter commands have a 180-second
subprocess deadline and sanitized environment. Errors/payloads are not logged.
The adapter must gather independent read-only observations, never echo caller
assertions as successful evidence or fill unknown inputs with success defaults.

* `preflight`: independently observed `configured:true` and
  `legacy_workflow:"disabled_manually"` for `production-deploy.yml`; no writes.
* `release-evidence`: current-main push, `event:"push"`, `branch:"main"`,
  `head_sha==main_sha==sha`, nonempty complete `jobs` all `"success"`, disabled
  legacy workflow, `api_only:true`, `schema_changed:false`,
  `worker_sensitive_changed:false`. Request additionally binds independently
  Docker-observed `production_revision`. Return that revision, matching
  `diff_base`, `diff_head:sha`, `complete_delta:true`, complete `changed_paths`
  and `delta_sha256`. The delta is the entire **deployed revision to candidate**,
  never merely latest push. `compatibility` binds `base`, `head`, `delta_sha256`,
  `paths_sha256` (canonical JSON list hash), `evidence_sha256` plus explicit
  `independent_review:true`, `all_shared_dependencies_reviewed:true`,
  `compatible:true`. No shared-code default approvals. Concrete schema/writer/
  Compose code paths are denied; documentation names mentioning workers pass
  path classification. Admission binds production revision, delta and proof
  hashes; new activation revalidates the same evidence. The known production
  `dee89140...` to candidate delta still needs actual independent review.
* `database`: query system `postgresql@18-main` through a separately provisioned
  read-only role and transaction. Return `server_major:18`, `read_only_role:true`,
  `transaction_read_only:true`, `failed_migrations:[]`, and `applied_migrations`
  rows `{name,checksum,finished_at,rolled_back_at:null}`. Finished timestamps
  must be nonempty; checksum is lowercase SHA256 of exact SQL bytes. Detect all
  failed/pending/rolled-back histories; never suppress them from failed evidence.
  Final layered filesystem requires regular `root/<14digits_name>/migration.sql`
  only (plus optional root migration_lock.toml), no nested aliases/links. Final
  names **and checksums** must equal successful database rows before image
  execution or candidate credentials. Whiteouts/opaque dirs/type replacements
  obey final filesystem semantics. No Prisma migration command is permitted.
* `postgres-identity`: empty request; independently observe the configured live PG
  cluster using `pg_controldata` or read-only SQL `pg_control_system()`. Return
  `method:"pg_controldata"` or `"pg_control_system"`, `server_major:18`, decimal
  string `system_identifier`, fresh `observed_at`. Never accept an identity from
  the release request. The same root-configured PG cluster must serve `database`.
* `backup`: root `backup_identity` pins canonical `wrapper`, `config_path`, `stanza`,
  numeric string `repository`, nonsecret stable `repository_id`, and decimal
  string `system_identifier`. Provision these independently; example placeholders
  are intentionally invalid. The adapter must discover the actual configured repo
  endpoint/path identity and match `repository_id`, never copy it from caller input.
  Use the trusted wrapper with explicit `--config`, `--stanza`, `--repo` to observe
  JSON info and execute read-only `repo-get` of the exact successful full's manifest.
  Cipher handling stays inside the wrapper; no plaintext config or cipher is returned.
  Return `format:"pgbackrest-full"`, `backup_type:"full"`, `status_code:0`,
  `error:false`, `server_major:18`, `backup_id` (`YYYYMMDD-HHMMSSF`),
  `pgbackrest_version`, `started_at`, `stop`, `completed_at==stop`, `verified_at`,
  all six identity fields, `database_id` and integer `repo_key` from that exact
  info entry. Its actual system identifier must match the separately observed live
  PG identity and root identity; repo key must match the configured repository.
  `config_sha256` hashes private bytes at the canonical config path; controller
  hashes that root-owned regular file before and after observation and compares.
  Adapter must reject untracked includes/options/environment or fingerprint their
  immutable configuration within the separately provisioned repository identity.
  `reference:"pgbackrest:<stanza>:<repository>:<backup_id>"` and `receipt_digest`
  (canonical standard-request JSON SHA256) remain required.
  Return exactly these `manifest` fields: `path`, SHA256 `sha256` of the actual
  decrypted repo-get bytes, positive bounded `bytes`, parsed `label`, `started_at`,
  `stop`, decimal string `system_identifier`, `server_major`, `database_id`,
  `backup_type`, 40hex `backrest_checksum`, `checksum_verified:true`. Verify the
  native pgBackRest manifest checksum using its supported implementation; the
  controller does not invent or substitute a metadata checksum algorithm.
  All parsed identity/label/timing fields must match the selected info entry.
  Separately return `repo_get` containing exactly `wrapper`, `config_path`,
  `config_sha256`, `stanza`, `repository`, `repository_id`, actual `path`, `sha256`,
  `bytes`, integer `status_code:0`. These are observations of the successful exact
  command and bytes, not request assertions. They must match root identity and the
  parsed manifest's path/hash/size. Missing/unrelated DB/repo/artifact proof fails.
  Fresh completed stop must fit `backup_max_age_seconds` (up to 24 hours in this
  migration-free lane; the six-hour example is an operator choice). Verification
  freshness uses `evidence_max_age_seconds`. Receipts retain only this finite
  metadata, immutable hashes and finite independent `live_identity`, never raw
  manifest/config/repository secrets. This is a trusted observer contract; real
  wrapper/PG/repo-get/checksum adapter E2E remains the separate main/operator gate.
  Fresh pg_dump-Fc/list/checksum validation exists only for a separate explicitly
  approved migration lane; this controller rejects it and stays migration free.
* `probe`: request binds Docker-observed `container_id`, `image_id`, `sha`.
  Adapter performs read-only HTTP `/ready` at `127.0.0.1:3000` **inside that exact
  container**, returns `transport:"docker-exec-http"`, `http_status:200`,
  `status:"ok"`, `service:"api-gateway"`, `postgres_pool_ok:true`, `ready:true`.
  No app revision response is required. Host independently checks image content
  ID/Descriptor/revision label and exact target ID/image/StartedAt/running state
  before and after the probe. Echo-only ready responses fail. Configured loop
  selectors are not evidence that loops run; no startup side-effect scan is claimed.

## Durable transitions and focused handoff

Only `up -d --no-deps --no-build --pull never api` is authorized. A one-field
image override must preserve all other normalized Compose/env-file/secret-mount
metadata. Admission also binds private SHA256 fingerprints of every root-selected
Compose YAML or JSON/CLI env file, every normalized service env_file and file-backed
secret/config. Inputs must be canonical root-owned regular files without symlinks,
group/world writes, unresolved env paths or files over 16 MiB (128 inputs maximum).
Every selected Compose root is structurally parsed before Docker config. Until
dependency closure is supported, mapping keys `include` and `extends` are denied
everywhere, including extension anchors, aliases, merges and escaped/quoted keys.
Same-file extends is also denied. Ordinary composition of explicitly configured
multiple `-f` YAML/JSON roots, aliases and merges remains supported. Custom tags,
non-string mapping keys, duplicate keys, cyclic aliases, multiple documents and
invalid merge sources fail closed. Bounds per root: 1 MiB, 20,000 parser events
and 64 nesting/alias levels; roots remain subject to the 128-input limit. This is
a structural rejection contract, not recursive dependency discovery or a YAML
constructor; private source values and parser errors are never logged.
Explicit CLI env files and `COMPOSE_DISABLE_ENV_FILE=1` disable implicit project
`.env`; no ambient caller Compose environment is inherited. Hashes are rechecked
at activation and immediately before up/rollback. Same bytes at the same paths
remain valid; changed env bytes or YAML fail before up. No expanded Compose or
secret values enter logs/receipts. Non-target container ID/image/StartedAt/running and fenced units/timers
must remain identical. Backup/database/compatibility checks precede image execution.

Journal fsync precedes up/rollback. Immutable terminal receipts are reconciled
against actual scope/container/readiness before new activation eligibility,
including the crash after receipt link but before journal outcome and main
advancement. An interrupted activation without a receipt retains current-main
CI gates and restores previous on stale main. Explicit rollback derives its
separate `-rollback` receipt from durable activation evidence even when journal
outcome is missing or the candidate is unhealthy. Bounded readiness rollback,
durable failure latch and append-only receipts remain enforced. Only last three
owned distinct release-image tags are retained; used/foreign images are protected,
never broad-pruned. Only an operator may repair/remove a latch.

Run focused checks: `bash -n ops/release/hetzner/{release-gate,check}.sh` and
`node_modules/.cicd-tools/release-python/bin/python3 -B -m unittest discover -s ops/release/hetzner -p '*_test.py' -v`.
`check.sh` additionally runs host shellcheck. Regression comments state what
makes each test red; real pipes, sparse headers, gzip expansion and SIGKILL at
the immutable receipt boundary are exercised. All prior 58 controller tests remain; Compose regressions add structural rejection,
activation/rollback fencing and actual daemon-free config proofs when Docker
Compose is available. Tests use the integration-provisioned PyYAML 6.0.3 venv;
`check.sh` requires its `bin` directory first in PATH.
Real Docker deployment/export/load, SSH/PG18/adapter/GitHub qualification remain main/operator gates;
no synthetic green result implies production readiness.
