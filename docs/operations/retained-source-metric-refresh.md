# Retained HN/Reddit metric refresh (seven-day repair v1)

This command repairs current engagement observations for retained source rows only. It does not collect missing posts, change historical content, run generation, refresh X/RSS, advance scheduled cursors, change promotion policy, or publish anything. Fixture checks do not establish live provider availability or improved seven-day summary quality.

The fixed admission is tenant `00000000-0000-7000-8000-000000006101`, workspace `00000000-0000-7000-8000-000000006102`, explicit UTC dates Aug 30–Sep 5, 2026, from source base `e1e82c01cf3287c0d5ef3aa3bd1d3b93eae9a8fd`. Sep 5 ends at the real planning time when planned that day; that cutoff remains frozen on resume, including after Sep 6 rollover. Default dates cover all seven days. A reviewed subset uses `--dates YYYY-MM-DD,...` in ascending order; the canonical operation slot can be used only once, so select its complete intended date scope before planning.

## Operator commands (for parent review; not executed by this worker)

Supply `METRIC_REFRESH_DATABASE_URL` through the authorized environment. No dotenv loading or DSN argument is supported. Run as uid 1000 with the existing secure evidence root `/var/lib/social-monitor/artifacts` owned by uid 1000, mode 0700. The existing descriptor-anchored evidence contract rejects symlinks, path aliases, owner changes, unsafe modes, and unequal overwrites. It requires Linux. No new database tables are required.

The revised entrypoint requires the existing maintenance locks even for dry run. First establish the release prerequisites below. Inside the parent's pinned, read-only Linux daily image, obtain `--implementation` using the direct Node command; this mode reads source/executable bytes only. Supply its exact hashes on every subsequent invocation. The Node executable SHA and source inventory SHA complement the parent's immutable image ID (which also pins dependencies and generated Prisma).

```sh
TS_NODE_PROJECT=tsconfig.build.json node -r ts-node/register -r tsconfig-paths/register scripts/run-retained-metric-refresh.ts --implementation

# Arguments below are reviewed values, not literal placeholders. The wrapper runs INSIDE the image.
bash scripts/run-retained-metric-maintenance.sh BACKEND_RELEASE_SHA CONTROL_RELEASE_SHA \
  --source-sha REVIEWED_SOURCE_SHA --executable-sha REVIEWED_NODE_SHA \
  --legacy-retirement-ref PARENT_EVIDENCE_REFERENCE \
  --operation-id 409f3cde-6073-451c-9285-eaa6802ca081

# Add --apply --manifest-sha EXACT_CURRENT_EFFECTIVE_SHA only for separately authorized execution.
# Resume uses the same operation, current effective SHA, directory and permanent budget.
```

Do not invoke this through `npm run` or the Node `run-with-timeout` wrapper: child spawning drops non-stdio lock descriptors. The supplied shell wrapper uses a direct `exec` chain through GNU timeout, preserving descriptors 7/9/8.

The default dry run emits every retained HN/Reddit source ID in the admitted window, including sources with zero visible feed projections or below promotion floors. It also emits rejected entries for review. Any rejected target blocks apply. There is no top-16 selection, source-ID override, force switch, fresh output directory, provider retry switch, or bypass for an existing operation.

The manifest binds operation ID, immutable canonical evidence location, source base, date/cutoff, limits, exact stored source/binding/provider/URL identities, original publication time, content identity digest, binding/config/interest/catalog digest, complete admitted feed identity digest, and existing authority time/hash/observation/regression counts. Config and content are hashed, not printed. The overall manifest SHA binds all these fields. Source and feed identity hashes remove only engagement fields that the canonical projection updates; original content, publication/ingestion time, lineage and nonmetric metadata remain bound. After the complete inventory check, every target in each new batch is reread and validated immediately before reserving its permanent fetch budget. Drift blocks that batch without a reservation or provider request. Existing reservations still reconcile or replay preserved observations without refetching. Each target is checked again before projection, and each sample is rechecked inside the projection's Serializable transaction, including binding/config/feed fanout drift.

## Durable execution and accounting

Canonical files live under `seven-day-6101-6102/retained-metrics-v1/` within the fixed secure root. They contain an envelope SHA and canonical JSON, installed exclusively, fsynced, and never overwritten:

- `operation.json`: the complete original admitted manifest; its exact bytes never change.
- `operation.lock`: permanent empty 0400 inode; kernel flock ownership, not existence, is the fence.
- `proposal-SHA.json`: immutable captured inventory/diff with no execution authority.
- `amendment-000001.json` through `amendment-000008.json`: contiguous reviewed head changes, before any reservation.
- `batch-N.reserved.json`: exact operation/manifest/batch identity before OAuth or provider fetch.
- `batch-N.observed.json`: actual post-fetch clock time, normalized metric payload, preserved exact source/sample identity and canonical metrics/hash/patch, or a fetch failure.
- `result-SOURCE_UUID.json`: stable terminal outcome with before/after authority evidence.
- `final.json`: terminal report when every target has a permanent result, including accounted provider failures. Uncertain fetches or unacknowledged projections keep it pending. Omitted/unavailable sources remain explicitly reported; completion does not mean all sources refreshed.

A reservation without observation evidence stops further fetches and reports all remaining sources uncertain. This includes a crash after HTTP succeeded but before evidence was durable. There is no automatic new fetch budget and no timeout-based reclamation. Preserve the files and reconcile externally; this command deliberately provides no invented-payload recovery path. A projection error/lost acknowledgement leaves the original observation intact and no terminal success receipt. Resuming safely projects the same sample/time, then reads durable authority to confirm it. A newer observation wins; it is reported as superseded. Stable terminal receipts are reused unchanged on subsequent resumes.

Canonical `buildSourceEngagementMetrics` rejects unknown kinds, malformed metrics and conflicting aliases. Preserved samples are rebuilt and compared before replay. `SourceEngagementProjectionPort` updates snapshots, cadence observations, observation-day rollups, source metric metadata, visible feed metric metadata and feed baseline samples. The repair composition skips tenant-wide retention; ordinary compositions retain existing behavior. Equal real observations can renew snapshot freshness, with cadence governing observation authority independently. Counters may fall; regression evidence is retained without clamping or claiming promotion eligibility. Output lists both snapshot and observation times; six-hour eligibility must be evaluated by the existing promotion policy at the eventual selection cutoff.

## Bounds and limitations

- Maximum inventory: 10,000 sources; over-limit inventories fail instead of returning a truncated manifest. Each source's feed inventory probes 1,001 rows; `fanout_over_1000` blocks apply. In that rejected case, the reported feed count is a lower bound, not a claim of full fanout coverage. Admitted fanouts are complete and at most 1,000.
- HN: existing Firebase `getStory(id)`, one ID/request, rejects wrong IDs/kinds/timestamps and missing/malformed counters; null/dead/deleted are unavailable. No Algolia or listing calls.
- Reddit: existing OAuth client/token provider plus one `getPostsByIds` capability, `GET /api/info?id=t3_...`. At most 100 IDs per batch is **our bound**, not a provider guarantee. Bare and `reddit:t3_...` stored identities remain unchanged. Canonical URLs and returned permalinks must identify the same post; short `/comments/ID` and `/r/SUBREDDIT/comments/ID/SLUG/` forms may differ in slug or trailing slash. Both URLs require HTTPS, an allowlisted Reddit host (`www.reddit.com`, `reddit.com`, `old.reddit.com`), no credentials, nondefault port or fragment, and a matching post ID. Returned fullnames and publication times must also match. Duplicate/unexpected fullnames, malformed counters and inconsistent omission sets fail closed. Official endpoint reference (verified by parent): https://www.reddit.com/dev/api/#GET_api_info.
- One fetch per batch per permanent operation; batches are sequential and an uncertain reservation stops successors. Each HTTP call has a 10-second timeout, including OAuth separately. There are no provider retries, including 429. OAuth tokens are cached within an invocation using the existing provider. The maintenance wrapper has a four-hour process limit; a timeout may leave a reserved batch requiring reconciliation.
- Database composition uses one shared `admin-tool` runtime pool (min 0, max 1), no auxiliary pools. The inventory is bounded but performs per-source reads; it is intentionally an operational repair, not a scheduler.
- Fresh metric payloads are reduced to identity-checked normalized counters; content and raw provider responses/credentials are not written into receipts. Returned counts include confirmed deleted/removed identities; omitted/null counts do not. Invalid or failed batch payloads provide no confirmed per-ID return evidence. Every provider/date cell includes target/returned/refreshed/superseded/unavailable/failed/uncertain counts and authority times/counts.
- No live DB/provider calls were made for implementation. Missing-post collection, X search/lookup, OLD/current quality comparison and paid generation remain separate parent work.

## Verification

Run focused Jest suites for the new use case, inventory, provider capability, Reddit HTTP contract, secure receipts, and the existing canonical projection/secure-filesystem contracts. On uid-remapped sandboxes whose `/tmp` is not root-owned, set `TMPDIR="$PWD/.cache"`; do not weaken the secure filesystem checks. Run production and focused-test TypeScript checks, affected-file ESLint, architecture/code-quality/source-line-cap/runtime-profile guards, source certification, and HN/Reddit fixture smoke checks.

A native PostgreSQL gate is supplied for the parent, not run by this worker. Provision a fresh loopback **disposable** database named `metric_refresh_test_*`, apply this source base's normal migrations there, and provide its DSN only in `METRIC_REFRESH_TEST_DATABASE_URL`. Do not reuse a real project database. The gate inserts exclusive fixture IDs, uses actual Prisma inventory and canonical projection transactions, injects a lost commit acknowledgement, and verifies resume without refetch/duplicate observations or content drift. It leaves DB fixtures for inspection; discard that disposable database afterward.

```sh
NODE_ENV=test METRIC_REFRESH_DISPOSABLE=1 npm run check:retained-metric-refresh-postgres
```

The gate rejects absent, non-loopback, non-test-named, or parameter-overridden DSNs before opening a socket. No native PostgreSQL success claim is made until that command passes on the parent's disposable instance.

## Reviewed content amendment for the occupied operation

For incident `409f3cde-6073-451c-9285-eaa6802ca081`, the original manifest payload SHA is `0f9fa678de1921b4847ab8f0224f96e4c367308bd56604d999cd670c16b8949a`. This is distinct from SHA-256 of the envelope file bytes. Parent must independently verify the actual original and the entire canonical directory before release; no production receipt was read by the implementation worker.

The supplied eligible diff is exactly HN source `ab5fc68e-c891-4641-8e67-a6568e4b7d4e` / `hn:49580353`: identity digest `bb32223966faefc45a54b863fab39b62e33c3e12e5733d8ab3678a0f31cd4828` to `f999a8b7f9ce49d0fe090e8869e3654871e63a555a62b73feb3dd27608cfc9e3`. Natural `contentUpdatedAt` changed after original planning. An opaque digest does not reconstruct old content. The amendment replaces only explicitly reviewed identity digests; scope, all 3,329 IDs, original ordering/batches, config/feed identities, cutoff, source base, limits, plannedAt and original authority baselines stay fixed. Fresh authority counters/times are captured separately, and may change again without becoming identity drift.

Use these additional arguments with the wrapper and common identity/release arguments above:

```sh
# 1. Capture the complete current inventory and explicit digest diff. No provider/projection work.
--prepare-amendment --prior-manifest-sha ORIGINAL_OR_CURRENT_EFFECTIVE_SHA \
  --reason 'Parent review reference and reason for the natural content version'

# 2. After external review of the exact proposal SHA, full inventory and effective SHA:
--commit-amendment REVIEWED_AMENDMENT_SHA \
  --prior-manifest-sha REVIEWED_PARENT_SHA --effective-manifest-sha REVIEWED_EFFECTIVE_SHA

# 3. Separate authorized invocation; old or wrong SHA refuses before database acquisition/effects:
--apply --manifest-sha REVIEWED_EFFECTIVE_SHA
```

Preparation prints `result.value` and `amendmentSha`; commit prints the verified original/effective head. Capture and commit each acquire a full fresh inventory. Both make zero OAuth/provider/projection calls. Apply checks the full inventory once inside the fenced use case; the duplicate CLI apply scan was removed. Dry run still scans the complete inventory, and per-batch, post-fetch and Serializable projection guards remain.

Hash meanings (all lowercase SHA-256): `originalManifestSha` hashes canonical original payload; `originalOperationBytesSha` hashes exact original envelope bytes; `inventorySha` hashes the captured complete targets sorted by source UUID, including captured authority; `identityInventorySha` hashes those sorted targets with only authority omitted; `effectiveManifestSha` hashes the original with accepted digest replacements; externally supplied `amendmentSha` hashes the amendment payload without a self-reference. The proposal carries capture start/end, reason/review reference, implementation/holder proof, exact before/after diff and the full zero-budget entry inventory plus its SHA.

Only 8 proposals, 8 committed amendments and 16 changed identity digests per proposal are admitted; each record is at most 16 MiB and JSON depth 32. These are ceilings, not authorization to accept extra incident changes. Review exactly the supplied one-row incident diff; additional drift requires a fresh separate review. No automatic amendment loop exists. Uncommitted proposals remain immutable and count against the bound. A newer proposal captures all earlier proposals; installing another proposal invalidates an earlier proposal's directory proof. Exact latest committed replay is idempotent before budget; stale parent/fork/gap/unequal bytes or exhausted limits require reconciliation without resets.

## Existing maintenance exclusion and legacy retirement

The parent owns activation. Before enabling this feature, positively establish that every old retained-metric invocation is terminal (including ones still reading inventory), that old-image/manual/queued launch routes cannot restart it, and that no evidence was removed. Record executable/image IDs, exact source and dependency release, process/container/service terminal evidence and the future writer admission route under `--legacy-retirement-ref`. That reference is an explicit parent attestation; the worker cannot prove its contents by checking a string. Missing reference/hashes or missing kernel holders refuse activation.

Use the real existing host lock inodes, in order: `/var/data/social-monitor/control/production-deploy.lock` (fd 7), `daily-run-singleton.lock` (fd 9), then `daily-run.lock` (fd 8). These names/order come from `ops/deploy/social-monitor-production-deploy.sh` and `ops/deploy/reader-summary-recovery-maintenance-lib.sh`. Parent must mount the exact root-owned 0644 host files and release markers at those paths in the reviewed immutable image, with the fixed artifact root writable as uid 1000. The inner wrapper opens existing locks read-only without creating/truncating them; it takes nonblocking flocks, checks backend/control/READY markers, then directly execs Node. Do not retain conflicting outer holders while asking the inner wrapper to acquire independent descriptors. Arrange container launch under the parent's release procedure; this patch does not change the production launcher.

The CLI verifies canonical path/regular file/owner/mode/link count and named/held device+inode, plus `/proc/self/fdinfo` exclusive FLOCK evidence on every operation assertion. Output includes pid, process start ticks and lock identities; the proposal binds their hash. Missing locks, busy holders, path substitution or mismatching source/executable fail closed. This proves participating maintenance exclusion, **not** retirement of arbitrary bypassing old code. A focused test executes the actual base use case and receipt adapter while holding the new operation lock and demonstrates that legacy code can still fetch. Neither `operation.lock` nor a new marker can retroactively stop it. Do not fabricate a reservation. Daily maintenance locks do not stop natural ingestion.

## Crash and concurrent writer rules

One verified kernel operation flock is held from head resolution through every receipt/effect in the updated invocation, including the final report. Contenders fail busy and may be explicitly re-invoked with the reviewed current head. Amendment wins: old-SHA apply refuses before reservation. First real reservation wins: amendments are permanently closed for the whole operation, including orphan/later-index reservations, crashes and failed/unused fetches. Even exact amendment replay is then refused. Batch names and fetch entitlement do not change.

Zero budget requires descriptor-anchored enumeration of the entire canonical directory, canonical typed original/proposal/chain validation, and no effect files anywhere. Unknown/malformed/unsafe/unreadable entries, duplicate keys, noncanonical JSON, missing known leaves, parent/inode swaps, hard links, symlinks and nonregular files are refusals, never absence. Evidence files and the lock are 0400; directories stay 0700. A failed/partial exclusive append is left in place. Complete crash leftovers require verified leaf and parent fsync before authority can be consumed; equal-byte replay repeats that barrier. Partial/malformed/conflicting authoritative names block; do not delete, replace, skip or create a new sequence/root to recover.

File fencing is not an atomic database snapshot or ingestion lock. Further drift before budget needs a new explicit review. After reservation this narrow facility is closed. A change between the last check and reservation can consume budget; the preserved post-fetch and transaction checks prevent projection against changed targets. Continuous ingestion may prevent full completion. A post-budget or coordinated-ingestion recovery requires separate design and parent authorization.

## Seven-day completion handoff

The parent must account for every original ID exactly once with no missing/extra IDs or new fetch entitlement, distinguish refreshed from superseded/unavailable/failed/uncertain, and verify confirmed before/after metric authority. `final.json` or a zero exit status is terminal accounting, not proof all 3,329 rows refreshed.

After verifying metric authority, use the existing `scripts/run-reader-summary-new-input-refresh.ts` prepare/review/apply path separately for each date Aug 30–Sep 5. Preserve its unconsumed per-date generation budget, canonical new-input requirement, 30-minute manifest freshness, promotion freshness/eligibility, original publications, source/runtime/fence/policy checks and exact reviewed SHA. Seven `no_eligible_input` outcomes do not satisfy completion. Require seven verified new publications, previous artifacts retained, and each successful date's expected +1 job/artifact/publication/outbox. No summary algorithm, thresholds, model, date policy or provider behavior is changed here.

Worker evidence is focused deterministic tests, real Linux process/flock/SIGKILL/I/O-failure tests and compiler/lint/architecture gates. SIGKILL tests are process-death evidence; they do not simulate storage hardware power loss. The narrowly extended native PostgreSQL gate checks real content-version drift, amendment, effective transactional sample guard rollback, lost acknowledgement and no-refetch/no-duplicate resume. The parent executes that gate on its disposable database before release; worker unit tests are not a native PostgreSQL or production success claim.
