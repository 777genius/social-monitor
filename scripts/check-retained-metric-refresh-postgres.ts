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
async function main() {
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
      process.stdout.write(`${JSON.stringify({ evidenceKind: "disposable_postgres_fixture", lostAckResume: "passed", fetches, results: resumed.value }, null, 2)}\n`);
    });
  } finally { await lease.close(); rmSync(root, { recursive: true, force: true }); }
}
if (require.main === module) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Metric refresh test gate failed"}\n`); process.exitCode = 1; });
