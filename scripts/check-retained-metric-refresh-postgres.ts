import { insertNativeRenewalSourceRows, nativeFixturePhase, type NativeRenewalSourceWriter } from "./lib/retained-metric-native-fixture";
import { runWithNativeMetricBudget, type RetainedMetricNativeBudget } from "./lib/retained-metric-native-budget";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { acquirePrismaPgRuntimeConnection, defaultPostgresRuntimePoolConfig, runWithSystemDatabaseAccess,
  runWithTenantDatabaseAccess, withPrismaWriteRetry, type PrismaPgRuntimeClientConstructor } from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";
import { CryptoIdGenerator, FixedClock } from "@social-monitor/shared-kernel";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import type { PrismaSourceEngagementClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-client";
import { PrismaRetainedMetricInventory, type PrismaMetricInventoryClient } from "@social-monitor/ingestion/adapters/persistence/prisma-retained-metric-inventory";
import { RefreshRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case";
import { metricRefreshBounds, metricRefreshSourceBase, metricRefreshDates, metricRefreshEvidencePath, metricRefreshTenant,
  metricRefreshWorkspace, sameTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import type { MetricFetchObservation, MetricRefreshManifest, RetainedMetricFetchCapability } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { metricRefreshDigest, SecureMetricRefreshReceipts } from "./lib/retained-metric-refresh-receipts";
import { AmendRetainedMetricManifestUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/amend-retained-metric-manifest.use-case";

import { retainedMetricRenewalGrant as renewalGrant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";
import { RenewRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-retained-metrics.use-case";
import { metricRefreshCells } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-report";
import { evaluateReaderPromotionV2 } from "@social-monitor/feed/domain/policies/reader-promotion-policy-v2";
import { buildSourceEngagementMetrics } from "@social-monitor/ingestion/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { exactPromotionPageEvidence } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-promotion-exact-evidence";
import type { PrismaFeedClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client";

type Row = Record<string, unknown>;
type Writer = { create(args: { data: Row }): Promise<unknown> };
type Client = PrismaMetricInventoryClient & PrismaSourceEngagementClient & { $disconnect(): Promise<void> };
const id = (suffix: number) => `00000000-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
export function requireMetricRefreshTestDatabase(env: NodeJS.ProcessEnv): string {
  const value = env.METRIC_REFRESH_TEST_DATABASE_URL;
  if (env.NODE_ENV !== "test" || env.METRIC_REFRESH_DISPOSABLE !== "1" || !value) throw new Error("Explicit disposable test database and NODE_ENV=test required");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !/^\/metric_refresh_test_[a-z0-9_]+$/u.test(url.pathname) || url.search || url.hash) throw new Error("Only a loopback metric_refresh_test_* disposable database is allowed");
  return value;
}
async function main(budget: RetainedMetricNativeBudget) {
  const database = requireMetricRefreshTestDatabase(process.env); // Fails before loading Prisma or opening a socket.
  mkdirSync(resolve(".cache"), { recursive: true });
  const PrismaClient = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<Client>>();
  const lease = await acquirePrismaPgRuntimeConnection(defaultPostgresRuntimePoolConfig(database, "admin-tool"), PrismaClient);
  const root = mkdtempSync(resolve(".cache/metric-refresh-postgres-"));
  const scope = { tenantId: metricRefreshTenant, workspaceId: metricRefreshWorkspace, dates: metricRefreshDates, endAt: "2026-09-05T12:00:00.000Z" };
  const publishedAt = new Date("2026-09-04T11:00:00Z");
  try {
    await runWithSystemDatabaseAccess("disposable metric refresh fixture seed", async () => {
      await withPrismaWriteRetry(() => lease.client.$transaction(async (transaction) => {
        const write = transaction as unknown as Record<string, Writer>;
        // Exclusive inserts deliberately fail if this fixture has ever been seeded; never reuse a real dataset.
        await write.tenant!.create({ data: { id: scope.tenantId, slug: "metric-refresh-test", name: "Fixture" } });
        await write.workspace!.create({ data: { id: scope.workspaceId, tenantId: scope.tenantId, slug: "fixture", name: "Fixture" } });
        await write.interest!.create({ data: { id: id(6200), tenantId: scope.tenantId, workspaceId: scope.workspaceId, name: "Fixture", query: "fixture", status: "ENABLED" } });
        for (let index = 0; index < 19; index++) {
          const providerKey = index % 2 ? "reddit" : "hacker-news";
          if (index < 2) {
            await write.sourceCatalogEntry!.create({ data: { id: id(6300 + index), providerKey, displayName: "Fixture", acquisitionMode: "http", readiness: "fixture" } });
            await write.sourceBinding!.create({ data: { id: id(6400 + index), tenantId: scope.tenantId, workspaceId: scope.workspaceId,
              interestId: id(6200), sourceCatalogEntryId: id(6300 + index), capabilityProfileVersion: 1, status: "ENABLED", config: {} } });
          }
          const metadata = { kind: index % 2 ? "reddit_post" : "hacker_news_story", provenance: "fixture", ...(index % 2 ? { score: 5 } : { points: 5 }) };
          const canonicalUrl = index % 2 ? `https://www.reddit.com/comments/abc${index}` : `https://news.ycombinator.com/item?id=${123 + index}`;
          const shared = { tenantId: scope.tenantId, workspaceId: scope.workspaceId, sourceBindingId: id(6400 + index % 2), providerKey, canonicalUrl,
            title: "Original", publishedAt, observedAt: publishedAt };
          await write.sourceItem!.create({ data: { ...shared, id: id(6500 + index), providerItemId: index % 2 ? `reddit:t3_abc${index}` : `hn:${123 + index}`, body: "Retained body", contentHash: "original", metadata, createdAt: publishedAt } });
          await write.feedItem!.create({ data: { ...shared, id: id(6600 + index), sourceItemId: id(6500 + index), interestId: id(6200),
            dedupeKey: `fixture-${index}`, bodyPreview: "Retained body", providerMetadata: metadata } });
        }
      }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 }));
    });
    await runWithTenantDatabaseAccess(scope, async () => {
      const inventory = new PrismaRetainedMetricInventory(lease.client, metricRefreshDigest);
      const targets = await inventory.list(scope);
      assert.equal(targets.length, 19);
      let manifest: MetricRefreshManifest = { version: "retained-metrics.v1", sourceBase: metricRefreshSourceBase, bounds: metricRefreshBounds,
        operationId: id(6250), evidencePath: metricRefreshEvidencePath, plannedAt: scope.endAt, scope, targets };
      let transactionDrift = true;
      const projection = new PrismaSourceEngagementProjectionAdapter(lease.client, new CryptoIdGenerator(), { retention: "skip",
        sampleGuard: async (transaction, _command, sample) => {
          const expected = manifest.targets.find((target) => target.sourceItemId === sample.sourceItemId)!;
          if (transactionDrift) {
            transactionDrift = false;
            const source = transaction as unknown as { sourceItem: { update(args: unknown): Promise<unknown> } };
            await source.sourceItem.update({ where: { id: expected.sourceItemId }, data: { body: "TEST transactional drift must roll back" } });
          }
          const inside = new PrismaRetainedMetricInventory(transaction as unknown as PrismaMetricInventoryClient, metricRefreshDigest);
          assert(sameTarget(expected, await inside.read(scope, expected.sourceItemId), metricRefreshDigest));
        } });
      let fetches = 0;
      const fetcher: RetainedMetricFetchCapability = { fetch: async (batch) => {
        fetches++;
        return { ok: true, value: batch.map((target): MetricFetchObservation => ({ externalId: target.externalId, returned: true, reason: null,
          metadata: target.providerKey === "reddit" ? { kind: "reddit_post", score: 42, numComments: 9 } : { kind: "hacker_news_story", points: 42, comments: 9 } })) };
      } };
      const receipts = SecureMetricRefreshReceipts.forTest(root);
      const clock = new FixedClock(new Date("2026-09-05T13:00:00.000Z"));
      await receipts.install(`${metricRefreshEvidencePath}/operation.json`, manifest);
      const originalBytes = readFileSync(resolve(root, metricRefreshEvidencePath, "operation.json"));
      await withPrismaWriteRetry(() => lease.client.$transaction(async (transaction) => {
        const source = transaction as unknown as { sourceItem: { update(args: unknown): Promise<unknown> } };
        for (const target of targets) await source.sourceItem.update({ where: { id: target.sourceItemId }, data: {
          body: "TEST natural source content version", contentHash: "changed", contentUpdatedAt: new Date("2026-09-05T12:01:00Z"),
        } });
        const write = transaction as unknown as Record<string, Writer>;
        for (let index = 0; index < 4; index++) await write.sourceItem!.create({ data: {
          id: id(6700 + index), tenantId: scope.tenantId, workspaceId: scope.workspaceId, sourceBindingId: id(6400), providerKey: "hacker-news",
          providerItemId: `hn:${9000 + index}`, canonicalUrl: `https://news.ycombinator.com/item?id=${9000 + index}`,
          title: "Late fixture", body: "Outside original operation", contentHash: "late", publishedAt, observedAt: publishedAt,
          createdAt: new Date("2026-09-05T12:02:00Z"), metadata: { kind: "hacker_news_story", points: 5 },
        } });
      }, { isolationLevel: "Serializable" }));
      assert.equal((await inventory.list(scope)).length, 23);
      const oldApply = new RefreshRetainedMetricsUseCase(inventory, fetcher, projection, receipts, clock, metricRefreshDigest);
      assert.deepEqual(await oldApply.execute(manifest), { ok: false, error: "inventory_drift" });
      const amend = new AmendRetainedMetricManifestUseCase(inventory, receipts, clock, metricRefreshDigest,
        { sourceSha: "1".repeat(64), executableSha: "2".repeat(64), holderProof: "3".repeat(64), legacyRetirementRef: "TEST-no-legacy" });
      const prepared = await amend.prepare(metricRefreshDigest(manifest), "TEST 19 natural content versions with four late arrivals");
      assert(prepared.ok); assert.equal(prepared.value.changes.length, 19); assert.equal(prepared.value.inventory.length, 19);
      const committed = await amend.commit(metricRefreshDigest(prepared.value), prepared.value.priorEffectiveSha, prepared.value.effectiveManifestSha);
      assert(committed.ok); manifest = committed.value.effective;
      assert.equal(fetches, 0);
      assert(readFileSync(resolve(root, metricRefreshEvidencePath, "operation.json")).equals(originalBytes));
      let loseAck = true;
      const uncertainProjection = { project: async (command: Parameters<typeof projection.project>[0]) => {
        const result = await projection.project(command);
        if (loseAck) { loseAck = false; throw new Error("fixture lost commit acknowledgement"); }
        return result;
      } };
      const usecase = new RefreshRetainedMetricsUseCase(inventory, fetcher, uncertainProjection, receipts, clock, metricRefreshDigest);
      const first = await usecase.execute(manifest);
      assert(first.ok && first.value.some((row) => row.status === "failed"));
      assert.equal((await inventory.read(scope, targets[0]!.sourceItemId))?.authority.observationCount, 0);
      const resumed = await usecase.execute(manifest);
      assert(resumed.ok && resumed.value.every((row) => row.status === "refreshed" && row.after.observationCount === 1));
      assert.deepEqual(await usecase.execute(manifest), resumed);
      assert.equal(fetches, 11); // Ten HN requests and one nine-ID Reddit batch, with no late IDs.
      assert.deepEqual(resumed.value.map((row) => row.sourceItemId).sort(), targets.map((row) => row.sourceItemId).sort());
      await assert.rejects(() => amend.prepare(prepared.value.effectiveManifestSha, "TEST never after reservation"), /metric_budget_already_started/u);
      for (let index = 0; index < 4; index++) assert.equal((await inventory.read(scope, id(6700 + index)))?.authority.observationCount, 0);
      for (const target of manifest.targets) {
        const current = await inventory.read(scope, target.sourceItemId);
        assert(sameTarget(target, current, metricRefreshDigest));
        assert.equal(current?.authority.observedAt, clock.now().toISOString());
      }
      await budget.runRenewal(() => nativeFixturePhase("renewal-total", () => checkNativeRenewal(lease.client)));
      process.stdout.write(`${JSON.stringify({ evidenceKind: "disposable_postgres_fixture", lostAckResume: "passed", fetches, results: resumed.value }, null, 2)}\n`);
    });
  } finally { await lease.close(); rmSync(root, { recursive: true, force: true }); }
}
// Synthetic incident evidence: the production original bytes are deliberately not
// read here. Only this fixture original payload gets the incident digest mapping.
async function checkNativeRenewal(client: Client) {
  const root = mkdtempSync(resolve(".cache/metric-renewal-postgres-"));
  const grant = renewalGrant, scope = { tenantId: grant.tenantId, workspaceId: grant.workspaceId, dates: grant.dates, endAt: grant.endAt };
  const clock = new FixedClock(new Date("2026-09-08T12:00:00.000Z"));
  const inventory = new PrismaRetainedMetricInventory(client, metricRefreshDigest);
  const addRows = async (start: number, count: number) => withPrismaWriteRetry(() => client.$transaction(async (tx) => {
    const source = (tx as unknown as { sourceItem: NativeRenewalSourceWriter }).sourceItem;
    await insertNativeRenewalSourceRows(source, start, count);
  }, { isolationLevel: "Serializable", timeout: 120000 }));
  try {
    await nativeFixturePhase("renewal-seed-3306", () => addRows(0, 3306)); // Existing 19 originals plus four prior arrivals = 23.
    const original: MetricRefreshManifest = { version: "retained-metrics.v1", sourceBase: metricRefreshSourceBase, bounds: grant.bounds,
      evidencePath: grant.predecessorPath, operationId: grant.predecessorOperationId, scope, plannedAt: clock.now().toISOString(), targets: await nativeFixturePhase("predecessor-inventory-3329", () => inventory.list(scope)) };
    assert.equal(original.targets.length, grant.originalCount);
    const originalHash = metricRefreshDigest(original);
    const hash = (value: unknown) => { const digest = metricRefreshDigest(value); return digest === originalHash ? grant.predecessorManifestSha : digest; };
    const prior = SecureMetricRefreshReceipts.forTest(root), renewal = SecureMetricRefreshReceipts.forTest(root, undefined, "renewal");
    const omitted: RetainedMetricFetchCapability = { fetch: async (batch) => ({ ok: true, value: batch.map((t) => ({ externalId: t.externalId, returned: false, metadata: null, reason: "omitted" })) }) };
    const projection = new PrismaSourceEngagementProjectionAdapter(client, new CryptoIdGenerator(), { retention: "skip" });
    const completed = await nativeFixturePhase("predecessor-v1-execute-3329", () =>
      new RefreshRetainedMetricsUseCase(inventory, omitted, projection, prior, clock, hash).execute(original));
    assert(completed.ok);
    await prior.install(`${grant.predecessorPath}/final.json`, { manifestSha: hash(original), results: completed.value, cells: metricRefreshCells(completed.value, grant.dates) });
    const predecessorBytes = await prior.withOperation((o) => o.entries());
    // HN/Reddit: comment-only falls both due and inside cadence, plus equal
    // counters inside cadence. All begin from the same stable 42/9 authority.
    for (const index of [1, 4, 5, 6, 7]) {
      const t = original.targets.find((target) => target.sourceItemId === id(6500 + index))!;
      const built = buildSourceEngagementMetrics({ providerKey: t.providerKey, metadata: t.providerKey === "reddit"
        ? { kind: "reddit_post", score: 42, numComments: 9 } : { kind: "hacker_news_story", points: 42, comments: 9 } });
      assert(built.metrics && built.metricsFingerprint);
      await projection.project({ tenantId: tenantId(scope.tenantId), workspaceId: workspaceId(scope.workspaceId), providerKey: t.providerKey,
        sourceBindingId: t.sourceBindingId, scanJobId: grant.operationId, observedAt: new Date("2026-09-08T11:55:00Z"), samples: [{
          sourceItemId: t.sourceItemId, externalId: t.externalId, publishedAt: new Date(t.publishedAt), metrics: built.metrics,
          metricsFingerprint: built.metricsFingerprint, providerMetadataPatch: built.providerMetadataPatch, refreshReadModels: true }] });
    }
    await addRows(3306, 1); // New admission includes this no-snapshot, zero-feed late arrival.
    const implementation = { sourceSha: "1".repeat(64), executableSha: "2".repeat(64), holderProof: "3".repeat(64), legacyRetirementRef: "TEST-native-renewal" };
    const prepare = new RenewRetainedMetricsUseCase(inventory, omitted, projection, prior, renewal, clock, hash);
    const admitted = await nativeFixturePhase("renewal-prepare-3330", () => prepare.prepare(implementation)); assert(admitted.ok);
    assert.equal(admitted.value.targets.length, 3330); assert.equal(admitted.value.capture.lateArrivalSourceItemIds.length, 1);
    const frozen = admitted.value;
    const guarded = new PrismaSourceEngagementProjectionAdapter(client, new CryptoIdGenerator(), { retention: "skip", sampleGuard: async (tx, _command, sample) => {
      const expected = frozen.targets.find((t) => t.sourceItemId === sample.sourceItemId)!;
      assert(sameTarget(expected, await new PrismaRetainedMetricInventory(tx as unknown as PrismaMetricInventoryClient, hash).read(scope, expected.sourceItemId), hash));
    } });
    const beforeRows = await renewalRows(client);
    let calls = 0, lostAck = true;
    const projectedSamples: unknown[] = [];
    const fetcher: RetainedMetricFetchCapability = { fetch: async (batch) => { calls++; return { ok: true, value: batch.map((t): MetricFetchObservation => ({
      externalId: t.externalId, returned: true, reason: null, metadata: t.providerKey === "reddit"
        ? { kind: "reddit_post", score: t.sourceItemId === id(6501) ? 20 : 42, numComments: [id(6503), id(6505)].includes(t.sourceItemId) ? 4 : 9 }
        : { kind: "hacker_news_story", points: t.sourceItemId === id(6500) ? 20 : 42, comments: [id(6502), id(6504)].includes(t.sourceItemId) ? 4 : 9 },
    })) }; } };
    const uncertain = { project: async (command: Parameters<typeof projection.project>[0]) => {
      projectedSamples.push({ observedAt: command.observedAt.toISOString(), samples: command.samples });
      const result = await guarded.project(command);
      if (lostAck) { lostAck = false; throw new Error("TEST renewal lost commit acknowledgement"); } return result;
    } };
    const run = new RenewRetainedMetricsUseCase(inventory, fetcher, uncertain, prior, renewal, clock, hash);
    const first = await nativeFixturePhase("renewal-first-execute-3330", () => run.execute(hash(frozen))); assert(first.ok && Array.isArray(first.value));
    assert.equal(await renewal.read(`${grant.evidencePath}/final.json`), null);
    const afterLostAck = await renewalRows(client);
    const spent = calls, resumed = await nativeFixturePhase("renewal-resume", () => run.execute(hash(frozen)));
    assert(resumed.ok && "results" in resumed.value, "resume must install terminal final, not pending outcomes");
    assert.equal(resumed.value.results.length, frozen.targets.length);
    assert(resumed.value.results.every((r) => r.status === "refreshed" && r.observedAt === clock.now().toISOString() &&
      r.after.observedAt === r.observedAt && r.after.metricsHash !== null));
    assert.deepEqual(resumed.value.results.map((r) => r.sourceItemId).sort(), frozen.targets.map((t) => t.sourceItemId).sort());
    assert.equal(projectedSamples.length, frozen.targets.length + 1);
    assert.deepEqual(projectedSamples.at(-1), projectedSamples[0], "lost acknowledgement reuses exact sample hash/time");
    assert.equal(calls, spent);
    const afterResume = await renewalRows(client);
    assert.deepEqual(afterResume.observations, afterLostAck.observations);
    assert.deepEqual(afterResume.rollups, afterLostAck.rollups);
    // Pending resume may reapply the same projection, touching Prisma updated_at.
    // Compare every business column and row; terminal replay below compares ALL bytes.
    const withoutWriteTime = (values: readonly Row[]) => values.map((r) => {
      const value = { ...r.value as Row }; delete value.updated_at; return value;
    }).sort((a, b) => metricRefreshDigest(a).localeCompare(metricRefreshDigest(b)));
    assert.deepEqual(withoutWriteTime(afterResume.snapshots), withoutWriteTime(afterLostAck.snapshots));
    assert.deepEqual(withoutWriteTime(afterResume.baselines), withoutWriteTime(afterLostAck.baselines));
    for (const row of beforeRows.observations) assert(afterLostAck.observations.some((r) => metricRefreshDigest(r) === metricRefreshDigest(row)), "prior observations retained");
    assert.deepEqual(afterLostAck.publications, beforeRows.publications);
    const rows = (values: readonly Row[]) => values.map((r) => r.value as Row);
    const observations = rows(afterLostAck.observations), snapshots = rows(afterLostAck.snapshots);
    assert.equal(observations.length - beforeRows.observations.length, frozen.targets.length - 5);
    assert.equal(snapshots.length, frozen.targets.length);
    assert.equal(afterLostAck.baselines.length, 19); // All admitted feed rows, including all comment-only falls.
    for (const result of resumed.value.results) {
      const snapshot = snapshots.find((r) => r.source_item_id === result.sourceItemId)!;
      assert.equal(snapshot.metrics_hash, result.after.metricsHash);
      assert.equal(new Date(String(snapshot.last_observed_at)).toISOString(), result.observedAt);
      const samples = observations.filter((r) => r.source_item_id === result.sourceItemId);
      assert.equal(samples.length, result.after.observationCount);
      assert(samples.some((r) => new Date(String(r.observed_at)).toISOString() === result.after.observationAt));
    }
    for (const rollup of rows(afterLostAck.rollups)) {
      const samples = observations.filter((r) => r.source_item_id === rollup.source_item_id && String(r.observed_at).slice(0, 10) === String(rollup.day).slice(0, 10));
      assert.equal(rollup.sample_count, samples.length);
      assert.equal(rollup.regression_count, samples.filter((r) => r.has_regression).length);
    }
    assert.equal(rows(afterLostAck.rollups).reduce((n, r) => n + Number(r.sample_count), 0), observations.length);
    assert.deepEqual(rows(afterLostAck.baselines).map((r) => r.feed_item_id).sort(), Array.from({ length: 19 }, (_, i) => id(6600 + i)).sort());
    for (const baseline of rows(afterLostAck.baselines)) assert.equal(new Date(String(baseline.observed_at)).toISOString(), clock.now().toISOString());
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const t = frozen.targets.find((target) => target.sourceItemId === id(6500 + index))!;
      const current = (await inventory.read(scope, t.sourceItemId))!;
      assert.equal(current.authority.observationCount, t.authority.observationCount + ([0, 2, 3].includes(index) ? 1 : 0));
      assert.equal(current.authority.observedAt, clock.now().toISOString());
      if (index >= 6) {
        assert.equal(current.authority.metricsHash, t.authority.metricsHash);
        assert.equal(current.authority.observationAt, t.authority.observationAt);
      }
    }
    const scoreFalls = await exactPromotionPageEvidence(client as unknown as PrismaFeedClient, [id(6600), id(6601)], clock.now());
    for (const feedId of [id(6600), id(6601)]) assert.equal(scoreFalls.get(feedId)?.metricAuthority?.regressionState, "unresolved_regression");
    const feedIds = [2, 3, 4, 5].map((i) => id(6600 + i));
    const evidence = await exactPromotionPageEvidence(client as unknown as PrismaFeedClient, feedIds, clock.now());
    for (const [index, feedId] of feedIds.entries()) {
      const authority = evidence.get(feedId)?.metricAuthority;
      assert(authority, `missing authority ${feedId}`);
      assert.equal(authority.regressionState, "unresolved_regression", `R2 comment-only ${index < 2 ? "due" : "not-due"} ${feedId}`);
      const eligibility = evaluateReaderPromotionV2({
        candidateId: feedId, canonicalIdentity: feedId, provider: index % 2 ? "reddit" : "hacker_news", contentKind: index % 2 ? "original_post" : "story",
        publishedAt: "2026-09-04T11:00:00.000Z", engagementCutoffAt: clock.now().toISOString(),
        admission: { relevanceFloorMet: true, qualityFloorMet: true, integrityFloorMet: true, safetyFloorMet: true, freshnessFloorMet: true },
        relevanceScore: 1, evidenceQualityScore: 1, integrityScore: 1, freshnessScore: 1,
        engagement: { state: "observed", authoritative: true, metrics: index % 2 ? { provider: "reddit", score: 42 } : { provider: "hacker_news", points: 42 },
          authority: { source: "durable_projection", observedAt: authority.observedAt.toISOString(), regressionState: authority.regressionState } },
      });
      assert(!eligibility.admitted);
      assert.deepEqual(eligibility.reasons, ["engagement_regression_unresolved"]);
    }
    await nativeFixturePhase("renewal-identity-check-3330", async () => {
      for (const target of frozen.targets) assert(sameTarget(target, await inventory.read(scope, target.sourceItemId), hash));
    });
    assert.deepEqual(await prior.withOperation((o) => o.entries()), predecessorBytes);
    const renewalBytes = await renewal.withOperation((o) => o.entries());
    assert.deepEqual(await nativeFixturePhase("renewal-terminal-replay", () => run.execute(hash(frozen))), resumed); assert.equal(calls, spent);
    assert.deepEqual(await renewalRows(client), afterResume);
    assert.deepEqual(await renewal.withOperation((o) => o.entries()), renewalBytes);
    assert.deepEqual(await prior.withOperation((o) => o.entries()), predecessorBytes);
    process.stdout.write("Native renewal: full inventory, late arrival, lost acknowledgement, identity preservation, due/not-due regression authority passed\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
}
// Complete scoped row bytes, including timestamps and every counter, not counts
// of two selected sources. Fixed SQL identifiers only; no production connection.
async function renewalRows(client: Client) {
  const query = client as unknown as PrismaFeedClient;
  const rows = async (table: string) => query.$queryRawUnsafe!<readonly Row[]>(
    `SELECT to_jsonb(row) AS value FROM ${table} row WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid ORDER BY to_jsonb(row)::text`,
    renewalGrant.tenantId, renewalGrant.workspaceId);
  return { snapshots: await rows("source_item_engagement_snapshots"), observations: await rows("source_item_engagement_observations"),
    rollups: await rows("source_item_engagement_daily_rollups"), baselines: await rows("feed_signal_baseline_samples"),
    publications: await rows("reader_summary_publications") };
}
if (require.main === module) void runWithNativeMetricBudget(main).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Metric refresh test gate failed"}\n`); process.exitCode = 1; });
