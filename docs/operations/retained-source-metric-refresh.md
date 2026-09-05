# Retained HN/Reddit metric refresh (seven-day repair v1)

This command repairs current engagement observations for retained source rows only. It does not collect missing posts, change historical content, run generation, refresh X/RSS, advance scheduled cursors, change promotion policy, or publish anything. Fixture checks do not establish live provider availability or improved seven-day summary quality.

The fixed admission is tenant `00000000-0000-7000-8000-000000006101`, workspace `00000000-0000-7000-8000-000000006102`, explicit UTC dates Aug 30–Sep 5, 2026, from source base `e1e82c01cf3287c0d5ef3aa3bd1d3b93eae9a8fd`. Sep 5 ends at the real planning time when planned that day; that cutoff remains frozen on resume, including after Sep 6 rollover. Default dates cover all seven days. A reviewed subset uses `--dates YYYY-MM-DD,...` in ascending order; the canonical operation slot can be used only once, so select its complete intended date scope before planning.

## Operator commands (for parent review; not executed by this worker)

Supply `METRIC_REFRESH_DATABASE_URL` through the authorized environment. No dotenv loading or DSN argument is supported. Run as uid 1000 with the existing secure evidence root `/var/lib/social-monitor/artifacts` owned by uid 1000, mode 0700. The existing descriptor-anchored evidence contract rejects symlinks, path aliases, owner changes, unsafe modes, and unequal overwrites. It requires Linux. No new database tables are required.

```sh
# Default: read the complete inventory, write immutable review evidence, no providers or database writes.
npm run run:retained-metric-refresh -- --operation-id 00000000-0000-7000-8000-000000006103

# Only after the parent has reviewed the exact manifest and authorized execution:
npm run run:retained-metric-refresh -- --operation-id 00000000-0000-7000-8000-000000006103 --apply --manifest-sha REVIEWED_MANIFEST_SHA

# Resume with the identical operation ID and SHA; never change evidence roots or delete receipts.
```

The default dry run emits every retained HN/Reddit source ID in the admitted window, including sources with zero visible feed projections or below promotion floors. It also emits rejected entries for review. Any rejected target blocks apply. There is no top-16 selection, source-ID override, force switch, fresh output directory, provider retry switch, or bypass for an existing operation.

The manifest binds operation ID, immutable canonical evidence location, source base, date/cutoff, limits, exact stored source/binding/provider/URL identities, original publication time, content identity digest, binding/config/interest/catalog digest, complete admitted feed identity digest, and existing authority time/hash/observation/regression counts. Config and content are hashed, not printed. The overall manifest SHA binds all these fields. Source and feed identity hashes remove only engagement fields that the canonical projection updates; original content, publication/ingestion time, lineage and nonmetric metadata remain bound. After the complete inventory check, every target in each new batch is reread and validated immediately before reserving its permanent fetch budget. Drift blocks that batch without a reservation or provider request. Existing reservations still reconcile or replay preserved observations without refetching. Each target is checked again before projection, and each sample is rechecked inside the projection's Serializable transaction, including binding/config/feed fanout drift.

## Durable execution and accounting

Canonical files live under `seven-day-6101-6102/retained-metrics-v1/` within the fixed secure root. They contain an envelope SHA and canonical JSON, installed exclusively, fsynced, and never overwritten:

- `operation.json`: the complete admitted manifest (dry run may install it).
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
- One fetch per batch per permanent operation; batches are sequential and an uncertain reservation stops successors. Each HTTP call has a 10-second timeout, including OAuth separately. There are no provider retries, including 429. OAuth tokens are cached within an invocation using the existing provider. The package command has a four-hour process limit; a timeout may leave a reserved batch requiring reconciliation.
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
