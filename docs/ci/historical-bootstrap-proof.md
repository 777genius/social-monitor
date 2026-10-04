# Historical bootstrap TEST proof handoff

`ops/ci/historical-bootstrap-transition.mts` is one operator-invoked compatibility
fixture, based on `d6f23bd33b0922c13e44cecde5a059b0c09235b7`. It does not change API
build inputs, the release controller, candidate qualification hooks or CI lanes.
Actual Docker/PG18 execution belongs to the coordinator on the server. Source and
typecheck handoff does not establish E2E success.

Use Node 22.23.3 with the existing integration TypeScript compiler and Node types:

```sh
node /absolute/integration/node_modules/typescript/bin/tsc \
  -p ops/ci/tsconfig.historical-bootstrap.json \
  --typeRoots /absolute/integration/node_modules/@types
npm run check:source-line-cap
wc -l ops/ci/historical-bootstrap-transition.mts
```

The existing source-cap scanner omits `.mts`; explicitly inspect the last count
against the 1000-line cap. Type stripping below is execution, not typechecking.
Do not install the dependency tree merely to run this helper.

Prepare an empty canonical 0700 TEST directory outside both input directories.
Supply a separate, exact, clean candidate checkout and the six accepted artifact
files (`candidate.tar`, checksum sidecar, manifest, phases, image ID, source SHA).
The migration lock file is optional, as in the candidate archive contract; every
SQL migration must match the manifest and the exact tracked source roster.
Both finite JSON receipts must be trusted coordinator outputs, with independently
selected SHA256 hashes. They are TEST input attestations, never production authority.
Do not manufacture acceptance assertions to get through the guard.

The candidate receipt has exact fields `schema`, `binding`, `config_digest`,
`archive_bytes`, `native_api_pg18_qualified`, `typed_consumer_accepted`. Schema is
`social-monitor-bootstrap-candidate-acceptance-v1`; both acceptance assertions are
true only after actual qualification. `binding` has exact fields `sha`, `ci_run_id`,
`image_id`, `archive_sha256`, `manifest_sha256`, all copied from accepted immutable
metadata. Config digest and archive size also bind that artifact. No candidate31
identity is hardcoded; a later exactly qualified 103-migration candidate is supported.
The qualified phases and native pool/history/cleanup proof are also validated.

The historical receipt has schema `social-monitor-historical-test-receipt-v1`,
the six frozen fields in `HISTORICAL` in the helper, `platform: "linux/amd64"`,
`source_label` equal to the historical source SHA, `root_verified: true`,
`attestation_graph_verified: true`, and exactly 20 ordered `layers`, each containing
`compressed_digest` and `diff_id` in `sha256:<64 lowercase hex>` form. The assertions
mean the coordinator verified the entire export root/attestation graph and both
layer representations. Supply that exact historical export as well. Its full hash
and length are checked. This private historical receipt accepts the frozen Docker
index independently of the unchanged normal candidate no-index/no-attestation parser.

Preload the exact historical and accepted candidate images and the PG18/Redis
digests exported by `candidate-runtime-contract.mts` into the selected Docker 29
Linux amd64 containerd daemon. The helper never pulls or loads images. Use a
canonical Unix socket path (for example `/run/docker.sock`, after checking it).

```sh
node --experimental-strip-types ops/ci/historical-bootstrap-transition.mts \
  --test-directory /private/new-bootstrap-TEST \
  --source /private/exact-candidate-checkout --candidate /private/accepted-artifact \
  --acceptance /private/accepted-candidate-receipt.json \
  --acceptance-sha256 sha256:<receipt-hash> \
  --historical-receipt /private/verified-historical-receipt.json \
  --historical-receipt-sha256 sha256:<historical-receipt-hash> \
  --historical-archive /private/verified-historical.tar \
  --docker-host unix:///run/docker.sock
```

The fixture references the frozen `release-database-plan.py` roles/first10/pre/
historical-CREATE/post recipe. It copies SQL from owned never-started images and
requires historical102 to equal candidate103 minus the one named finite migration.
There are no host project mounts, host ports, privileged containers or socket mounts.
Only random labeled namespace resources are started, executed or removed. Every
SQL command first checks the owned PG identity and refuses production system ID
`7688442011877063482`. Provider loops are disabled; all keys/passwords are synthetic.

Cases cover old API/102; verified `pg_dump -Fc`; real duplicate-function failure
after preceding grants with ownership/ACL/function fingerprints unchanged; TEST
Prisma rollback resolution retaining its failed attempt; one successful missing
migration; all103 checksums and four finite function owners/search paths/ACLs;
unchanged owner memberships; old and candidate pool readiness on 103; image rollback
with 103 retained; and a separate fenced restore recovering 102/catalog/old readiness.
No finite tenant is seeded and no reserve/publish function is invoked.

The pending revision also distinguishes NULL ACLs from explicit empty ACL arrays.
A TEST-only restored-database function checks default PUBLIC EXECUTE, a real
revoke-all empty ACL, changed effective access and distinct catalogue fingerprints;
dropping the probe must reproduce the original catalogue. Cleanup has its own
four-minute command budget within the overall absolute deadline. The prior
execution below does not qualify these new checks until a fresh run passes.

`proof.json` records immutable bindings, daemon/PG IDs, exact owned resource IDs,
case fingerprints, stable API image/ID/StartedAt and cleanup results. `pre103.dump`
is retained in the private directory. Creates are journaled before invocation;
IDs are persisted before start/copy/exec. Ambiguous creates, failed cleanup, crashes
and deadline failures remain pending/failed, retain evidence/resources and cannot
count as success. Cleanup uses exact recorded identifiers with label/image/network/
daemon checks, never prune. Inspect retained IDs manually under the same fences;
do not rerun against that directory or silently adopt resources by name.

The coordinator completed an actual isolated execution on 2026-10-04 in 66.282
seconds, using helper commit 3c732bde136a0c8721fc391fab014e04b6630137 and accepted
candidate 31e1953614710b802fb43eb9d5f2bfd0beea78b3. All 14 recorded cases and owned-resource
cleanup passed. The final TCP listener readiness check also passed. The restored catalogue matched the pre-migration catalogue; a real
PUBLIC SELECT grant made effective access and the catalogue differ, and REVOKE
restored both. NULL relation ACLs use PostgreSQL owner defaults for tables/views and
sequences; explicit ACLs, grantors and grant options remain part of the comparison.

Evidence belongs to that exact invocation and candidate. A future candidate needs
its own accepted artifact and fresh fixture execution. Scope is historical
API/schema/migration/backup-restore TEST compatibility. Worker-task/provider parity,
production install/systemd/SSH closure and production backup/restore qualification
need their own evidence. This helper grants no production change or release permission.
