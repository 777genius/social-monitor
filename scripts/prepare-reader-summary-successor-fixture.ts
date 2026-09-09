/** Operator-only: never starts a cluster or creates a database. */
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { Pool } from "pg";
import { FixedClock } from "@social-monitor/shared-kernel";
import { resolvePostgresRuntimePoolConfig, runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaFeedConnection } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { assertFixtureTarget, readFixtureMarker, attestEmptyFixture } from "./lib/reader-summary-successor-fixture-safety";
import { migrateSuccessorFixture } from "./lib/reader-summary-successor-fixture-migrations";
import { fixtureDate, fixtureNow, fixtureId, fixtureJob, insertFixtureJob, seedSuccessorPrior, seedSuccessorInput } from "./lib/reader-summary-successor-fixture-seed";
import { assertRefreshManifest, refreshBytesHash, refreshHash, refreshOperation, refreshScope, type RefreshManifest } from "./lib/reader-summary-new-input-refresh-manifest";
import { captureRefreshAuthority, assertRefreshHasNewInput, refreshPeriod } from "./lib/reader-summary-new-input-refresh-capture";
import { readRefreshPrior, readRefreshJobs, readRefreshCounts } from "./lib/reader-summary-new-input-refresh-postgres";
import { assertRefreshReconciliationEvidence, reconcileConsumedRefreshJob, type RefreshReconciliationEvidence } from "./lib/reader-summary-new-input-refresh-reconciliation";
import { assertRefreshSuccessorCurrent } from "./lib/reader-summary-new-input-refresh-successor";
import { readReviewedRefresh } from "./lib/reader-summary-new-input-refresh-files";

async function main(): Promise<void> {
  const [raw, markerPath, outputPath, ...extra] = process.argv.slice(2);
  assert(raw && markerPath && outputPath && extra.length === 0,
    "usage: prepare-reader-summary-successor-fixture.ts ADMIN_SOCKET_URL IMMUTABLE_MARKER NEW_OUTPUT_DIRECTORY");
  const marker = readFixtureMarker(markerPath), url = assertFixtureTarget(raw, marker);
  // Do not consult ambient DB/auth configuration. The migration executor
  // inherits only this allowlist; repository dotenv imports read /dev/null.
  process.env = { PATH: [join(process.cwd(), "node_modules/.bin"), dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
    DOTENV_CONFIG_PATH: "/dev/null", PGPASSFILE: "/dev/null", JITI_FS_CACHE: "false", TZ: "UTC" };
  const output = resolve(outputPath);
  const parent = resolve(output, "..");
  assert.equal(realpathSync(parent), parent, "output parent must be a real existing directory");
  mkdirSync(output, { mode: 0o700 }); // exclusive, before any database mutation
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  let runtime: Pool | undefined;
  let summary: PrismaSummaryConnection | undefined;
  let feed: PrismaFeedConnection | undefined;
  try {
    await attestEmptyFixture(admin, marker);
    const runtimeUrl = await migrateSuccessorFixture(admin, url);
    runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
    const auditor = await admin.connect(), writer = await runtime.connect();
    try {
      await seedSuccessorPrior(auditor, writer);
      await auditor.query("begin isolation level serializable");
      try { await seedSuccessorInput(auditor); await auditor.query("commit"); }
      catch (error) { await auditor.query("rollback"); throw error; }
    } finally { writer.release(); auditor.release(); }
    const config = resolvePostgresRuntimePoolConfig({ DATABASE_URL: runtimeUrl,
      POSTGRES_RUNTIME_PROCESS: "daily-runner", POSTGRES_RUNTIME_POOL_MIN: "0", POSTGRES_RUNTIME_POOL_MAX: "2" });
    summary = await PrismaSummaryConnection.create(config);
    feed = await PrismaFeedConnection.create(config);
    const db = summary, feedReader = new PrismaFeedItemReadRepository(feed), clock = new FixedClock(fixtureNow);
    const result = await runWithTenantDatabaseAccess(refreshScope, async () => {
      const prior = await readRefreshPrior(db, fixtureDate);
      const observedThrough = "2026-09-05T21:59:00.000Z";
      await assertRefreshHasNewInput(db, fixtureDate, prior.observedThrough, observedThrough);
      const authority = await captureRefreshAuthority({ client: db, feed: feedReader, date: fixtureDate,
        observedThrough: new Date(observedThrough), clock });
      assert.equal(authority.feedCount, 1); assert.equal(authority.eligibleCount, 1); assert.equal(authority.metricRowCount, 2);
      const period = refreshPeriod(fixtureDate);
      const base: Omit<RefreshManifest, "operation"> = {
        format: "reader-summary-seven-day-new-input-v1", ...refreshScope, date: fixtureDate,
        startedAt: period.startedAt.toISOString(), endedAt: period.endedAt.toISOString(), timezone: "UTC",
        observedThrough, preparedAt: fixtureNow.toISOString(), prior, authority,
        sourceSha256: refreshHash("fabricated-successor-source-v1"),
        deployedSourceSha256: refreshHash("fabricated-successor-source-v1"),
        generationSha256: refreshHash("fabricated-successor-generation-v1"),
        runtime: { engine: "subscription-runtime-cli", packageVersion: "synthetic-fixture-v1",
          launcherSha256: refreshHash("fabricated-launcher-never-executed") },
        fenceAuthority: { global: "1:1", dates: "1:2", fences: "1:3" },
        model: "gpt-5.6-sol", reasoningEffort: "high",
      };
      const original: RefreshManifest = { ...base, operation: refreshOperation(base) };
      assertRefreshManifest(original, clock.now());
      const originalBytes = Buffer.from(JSON.stringify(original));
      const failed = fixtureJob(fixtureId(20), original.operation, fixtureNow)
        .start({ startedAt: fixtureNow }).fail({ failedAt: fixtureNow,
          failureReason: "Fabricated failed assessment; no actual invocation; usage unknown" });
      const client = await runtime!.connect();
      try {
        await client.query("select set_config('social_monitor.tenant_id',$1,false), set_config('social_monitor.workspace_id',$2,false)",
          [refreshScope.tenantId, refreshScope.workspaceId]);
        await insertFixtureJob(client, failed);
      } finally { client.release(); }
      const evidence: RefreshReconciliationEvidence = {
        format: "reader-summary-new-input-refresh-reconciliation-v1", ...refreshScope, date: fixtureDate,
        jobId: fixtureId(20), operation: original.operation, manifestSha256: refreshBytesHash(originalBytes),
        reason: "consumed_provider_invocation_without_summary", invocation: {
          requestId: "fabricated-successor-failed-assessment", purpose: "social_monitor.relevance.assess_source_content.v1",
          requestSha256: refreshHash("fabricated-request"), attemptSha256: refreshHash("fabricated-attempt"),
          consumedAt: fixtureNow.toISOString(), returnedAt: fixtureNow.toISOString(), outcome: "failed", providerUsageReported: false,
        },
      };
      assertRefreshReconciliationEvidence(evidence, [fixtureDate]);
      const evidenceBytes = Buffer.from(JSON.stringify(evidence));
      const receipt = await db.$transaction(tx => reconcileConsumedRefreshJob({ client: tx, evidence,
        evidenceSha256: refreshBytesHash(evidenceBytes), now: fixtureNow, ids: { generate: () => fixtureId(21) } }),
      { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 });
      const grant = { ...base, successor: { format: "reader-summary-new-input-refresh-successor-v1" as const,
        originalJobId: fixtureId(20), reconciliationId: receipt.reconciliationId,
        originalManifestJson: originalBytes.toString("utf8"), expiresAt: "2026-09-05T22:20:00.000Z" } };
      const manifest: RefreshManifest = { ...grant, operation: refreshOperation(grant) };
      await assertRefreshSuccessorCurrent(db, manifest, clock.now());
      assert.deepEqual(await readRefreshPrior(db, fixtureDate), prior);
      const jobs = await readRefreshJobs(db, fixtureDate);
      assert.equal(jobs.length, 1); assert.equal(jobs[0]?.status, "FAILED");
      const counts = await readRefreshCounts(db, fixtureDate);
      assert.deepEqual(counts, { publications: 1, outbox: 1, jobs: 2, artifacts: 1 });
      assert.equal((await db.$queryRaw<readonly unknown[]>`select * from reader_summary_new_input_refresh_reconciliation_counters`).length, 0);
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      for (const [name, bytes] of [["original.json", originalBytes], ["reconciliation.json", evidenceBytes],
        ["successor.json", manifestBytes]] as const) writeFileSync(join(output, name), bytes, { flag: "wx", mode: 0o444 });
      const manifestSha256 = refreshBytesHash(manifestBytes), manifestPath = join(output, "successor.json");
      assert.deepEqual(readReviewedRefresh(manifestPath, manifestSha256), manifest);
      return { status: "prepared", synthetic: true, nativeGate: "not-run", runtimeUrl,
        markerPath: resolve(markerPath), manifestPath, manifestSha256, counts, reconciliation: receipt };
    });
    writeFileSync(join(output, "receipt.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o444 });
    console.log(JSON.stringify(result));
  } finally { await feed?.close(); await summary?.close(); await runtime?.end(); await admin.end(); }
}
if (require.main === module) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "fixture preparation failed");
  process.exitCode = 1;
});
