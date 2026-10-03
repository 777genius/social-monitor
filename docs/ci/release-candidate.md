# Native API release candidate

This patch adds a producer and an authored job fragment, with no active workflow
or production change. The starting source is main
`3854c9d491d156e6fb2ade0492ad2f5bf0ea1eb7`. Every candidate records the actual clean
checkout's full HEAD and numeric CI run ID. PR jobs normally check out a merge
commit: that commit is the source, and must never be described as the PR head.
Public PR output has no deployment authority. Only the controller's separate
current-main, completed-CI and independent operator evidence can admit deployment.

Run with Node 22, Python 3 and native Docker 29 on linux/amd64:

```sh
node scripts/ci/release-candidate.mjs \
  --directory /tmp/sm-api-candidate-123 \
  --source-sha FULL_CHECKED_OUT_SHA --run-id 123 \
  --controller-dir ops/release/hetzner
```

The directory must be absolute, without symlink ancestors, outside the checkout,
and reserved for this one job. Git internals must be readable; the producer fails
closed when HEAD cannot be observed. Only a bounded Git archive of that exact commit enters the build context;
ignored/generated workspace files cannot alter COPY or SQL. The Dockerfile's
existing `app` target builds
once with `--provenance=false --platform linux/amd64`, adding revision/run labels
without replacing other image labels. No tag is created. Native Docker Image.ID
is the platform manifest digest; the distinct config digest is verified from the
archive graph. The export is `docker image save FULL_IMAGE_ID`, not a repository
tag. There is no production build, registry download or consumer retag step.

`phases.json` is atomically published before building and after build/export/proof;
source and full image ID are emitted before archive qualification. Retry the same
command and directory after export, qualification or artifact upload failure. It
rereads actual HEAD and image/labels/Descriptor and verifies retained archive
bytes. Upload-only retry also checks the durable qualified-manifest checksum,
skipping completed qualification. It resumes only the missing phase, never builds again. Interrupted build
intent without a durable IID is ambiguous and requires operator reconciliation;
it fails rather than starting a second build. A surviving `producer.lock` after
SIGKILL or OOM also requires manual reconciliation; automatic stale-lock takeover
is forbidden. A dead producer PID does not prove its Docker child has finished.
Before removing a retained lock, an operator must prevent competing producers,
verify that every child build/save has completed, and independently verify the
retained IID/archive against this source/run and the daemon graph. Keep ambiguous
pending bytes for investigation; process death is never authorization to retry a
build or save. Removing a lock while another owner can acquire it risks unlinking
that new owner's lock. Only after this reconciliation may the same directory be
resumed; otherwise retain the lock and fail closed. Ordinary unwinding attempts
lock unlink even when closing its file handle reports an error.
If archive publication succeeds but the exported journal rename fails, retry
reconciles the retained final archive using its actual hash/byte count and the
independent controller verifier, binding source/run/image and the full daemon
rootfs/descriptor graph before publishing the missing journal. Invalid retained
archives fail without another save. A retained pending export is ambiguous;
its bytes are preserved and require reconciliation rather than automatic export.
Deleting the directory or retrying on a new hosted runner loses the build receipt
and is a new build, not a supported build-once resume.

The producer invokes the actual independent controller `archive.py` in isolated
Python mode. It derives exact final-layer migration SQL inventory from image
bytes, including whiteouts, rather than consulting workspace Prisma files. It
rejects indexes, attestations, foreign tags, unsupported media/platforms,
filesystem aliases/traversal, invalid layouts and corrupt graph/layer bytes.
Unknown database migrations/checksums are refused by the separate controller's
independent PG18 admission policy; the producer does not claim database parity.

`manifest.json` has exactly Controller v1's `receive` import-object fields:
`sha`, `ci_run_id`, `archive_sha256`, `image_id`, `archive_bytes`, `migrations`,
`image_graph`. That object is unversioned in the supplied contract; local phase
receipts use `version:1`. The archive, manifest and checksum outputs are finite,
regular, atomically published files. The archive is at most 10 GB. Controller
processing bounds also apply (2 GiB member, 8 GiB expanded layers, 120 seconds).

The authored `ops/ci/release-candidate-job.yml` preserves `production_runtime`'s
name and three existing gate commands. The root must integrate the controller
source and job together, review the pinned setup-Docker action/version, and run
real Docker qualification. The fragment is inert and grants only `contents:read`;
no secrets, OIDC write or production action. Focused tests currently use the
read-only supplied controller copy in `node_modules/.cicd-evidence/controller`;
after integration they also support the installed repository controller path.

```sh
node --test scripts/ci/release-candidate.test.mjs ops/release/e2e/harness.test.mjs
```

Tests include an independent stdlib OCI fixture writer and real controller
archive/SQL validation. Process-seam tests prove one build/save across proof and
upload retries, exact resume identity refusal and ambiguous-build refusal. Each
regression states its red trigger. These are not real-daemon E2E evidence.

## Disposable E2E integration point

```sh
node ops/release/e2e/harness.mjs CANDIDATE_DIR CONTROLLER_DIR DRIVER FULL_BASELINE_ID
```

The separately reviewed executable driver accepts only provision/cleanup operations
and a fixture.json path, and outputs one finite JSON object. Provision creates
the random fixture's own Compose project with api, postgres, ssh,
jev-agent-runtime, jev-intelligence-worker and social-x-collector, preloaded
baseline/SSH and PG18 images on a separate consumer daemon (the candidate must
initially be absent), random loopback ports and generated synthetic SSH keys.
PostgreSQL user/database are e2e. It returns version:1, ssh_port, ssh_key,
known_hosts; both key paths must live under the random fixture directory.
The harness verifies that the supplied loopback SSH port belongs to the owned
SSH container before sending any verb. The e2e SSH user must have the real
forced-command controller. The driver installs
the reviewed controller/operator adapter only in disposable fixtures, with
independent PG18 history and backup evidence; never on the real host. It must
prepare the public Prisma history table from synthetic fixture data. The harness
does not execute migrations. It inserts/deletes one uniquely owned history row
to test unknown-migration refusal, and verifies exact history restoration.

Host bind mounts must remain under the random fixture directory. Every mounted
volume and attached network must carry this random Compose project's ownership
label. No host credentials/auth mounts are accepted. A Docker socket may use an
owned volume only within the separately isolated Docker-host qualification fixture.
Cleanup must remove only this random project and its own resources, including
after partial provisioning. No build, pull, foreign retag or provider call is
allowed in either driver operation.

The harness itself streams mutated/original archives through real SSH receive,
requires exit 1 with exactly `{"denied":"grammar"}` for an unknown verb,
checks the controller's exact nonzero JSON denial for archive-digest and image
label mismatch, and checks unknown PG18 history through SSH admit. Successful
receive must return exactly the verified candidate manifest. Admission, activation,
verification, rollback and receipt retrieval also run directly over SSH.
Activation/rollback receipts must bind the exact source/run/archive/image/graph,
previous image, API-only scope, unchanged migration status, successful probes and
identical non-target snapshot hashes. Driver success booleans cannot supply these
proofs. Docker observations independently verify native Docker 29, actual candidate
load/readiness, preserved non-target ID/image/StartedAt, unchanged foreign image
tags and baseline rollback. Controller-owned immutable retention aliases remain
under the controller policy.
The harness keeps finite evidence under its random temporary directory.

The actual fixture driver and final controller/operator adapter seam are not
merged here. Real Docker 29.8.1 cross-daemon load, forced-command SSH, PG18
admission/backup and rollback remain root qualification work. Missing fixtures,
wrong denial reasons, transport errors and absent receipts fail closed. There is
no mock-backed real E2E claim. Production Docker must not be upgraded by this patch.
