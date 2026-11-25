/** Native-only gate. Requires an attested, migrated fabricated fixture. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FixedClock, tenantId, workspaceId, CryptoIdGenerator } from "@social-monitor/shared-kernel";
import { runWithTenantDatabaseAccess, resolvePostgresRuntimePoolConfig, getPostgresRuntimePoolDiagnostics } from "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import { readReviewedRefresh } from "./lib/reader-summary-new-input-refresh-files";
import { assertRefreshManifest, refreshBytesHash, refreshOperation, type RefreshManifest } from "./lib/reader-summary-new-input-refresh-manifest";
import { assertRefreshSuccessorCurrent, consumeRefreshSuccessor } from "./lib/reader-summary-new-input-refresh-successor";
import { readRefreshCounts, readRefreshPrior, readRefreshJobs } from "./lib/reader-summary-new-input-refresh-postgres";
import { reconcileConsumedRefreshJob, refreshReconciliationAccounting, type RefreshReconciliationEvidence } from "./lib/reader-summary-new-input-refresh-reconciliation";
import { nativeScenarios } from "./lib/reader-summary-successor-native-scenarios";
import { fixtureObserver, required, instrument, assertUnlocked, sqlState } from "./lib/reader-summary-successor-native-support";

async function main() {
  const { observer, url } = await fixtureObserver();
  let summary: PrismaSummaryConnection | undefined;
  try {
    const m = readReviewedRefresh(required("READER_SUMMARY_REFRESH_TEST_MANIFEST_PATH"), required("READER_SUMMARY_REFRESH_TEST_MANIFEST_SHA256"));
    assert(m.successor, "prepared fixture must supply the exact reconciled successor grant");
    // Synthetic fixed operation clock: no wall-clock expiry edits to reviewed bytes.
    const clock = new FixedClock(new Date(m.preparedAt));
    assertRefreshManifest(m, clock.now());
    await observer.query("select set_config('social_monitor.tenant_id',$1,false), set_config('social_monitor.workspace_id',$2,false), set_config('social_monitor.system_access','false',false)", [m.tenantId, m.workspaceId]);
    summary = await PrismaSummaryConnection.create(resolvePostgresRuntimePoolConfig({ DATABASE_URL: url,
      POSTGRES_RUNTIME_PROCESS: "daily-runner", POSTGRES_RUNTIME_POOL_MIN: "0", POSTGRES_RUNTIME_POOL_MAX: "2" }));
    const db = summary;
    await runWithTenantDatabaseAccess(m, async () => {
      assert.deepEqual(getPostgresRuntimePoolDiagnostics(), { poolInstances: 1, prismaClientInstances: 1, activeConnectionLeases: 1, closing: false });
      await assertRefreshSuccessorCurrent(db, m, clock.now());
      const initialJobs = await readRefreshJobs(db, m.date);
      assert.equal(initialJobs.length, 1); assert.equal(initialJobs[0]?.jobId, m.successor!.originalJobId);
      const initialCounts = await readRefreshCounts(db, m.date);
      assert.deepEqual(await readRefreshPrior(db, m.date), m.prior);
      const accounting = await observer.query("select accounting from reader_summary_new_input_refresh_reconciliations where id=$1", [m.successor!.reconciliationId]);
      assert.deepEqual(accounting.rows, [{ accounting: refreshReconciliationAccounting }]);
      const snapshot = async () => ({ jobs: await readRefreshJobs(db, m.date), counts: await readRefreshCounts(db, m.date),
        prior: await readRefreshPrior(db, m.date), reconciliations: (await observer.query("select to_jsonb(r) as row from reader_summary_new_input_refresh_reconciliations r order by id")).rows,
        counters: (await observer.query("select to_jsonb(r) as row from reader_summary_new_input_refresh_reconciliation_counters r order by id")).rows });
      const initial = await snapshot();
      const job = (manifest = m) => ReaderSummaryJob.request({ id: randomUUID(), tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
        scope: { type: "workspace" }, period: buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC", startedAt: new Date(m.startedAt), endedAt: new Date(m.endedAt) }),
        idempotencyKey: manifest.operation, requestedAt: clock.now() });
      const overlaps: number[][] = [];
      const observed = instrument(db, async (_tx, _index, sql, phase) => {
        if (sql.includes("select exists(select 1 from pg_catalog.pg_locks") && phase === "after") {
          const rows = await observer.query<{ pid: number }>("select pid from pg_locks where relation='reader_summary_jobs'::regclass and mode='ShareLock' and granted order by pid");
          // Holder-loss scenarios deliberately leave only admission's lock.
          // Let the actual protection guard report that loss, never replace it
          // with an instrumentation assertion. Successful overlap is required below.
          if (rows.rowCount !== 2) return;
          assert.notEqual(rows.rows[0]!.pid, rows.rows[1]!.pid);
          overlaps.push(rows.rows.map((row) => row.pid));
        }
      });
      const result = await nativeScenarios({ summary: observed, observer, manifest: m, clock, job, snapshot });
      const concurrent = await readRefreshJobs(db, m.date);
      assert.equal(concurrent.length, 1 + result.concurrentCommits);
      if (result.concurrentCommits === 0) await result.consume();
      assert(overlaps.length > 0);
      const after = await snapshot();
      assert.equal(after.jobs.length, 2);
      assert.deepEqual(after.jobs.find((row) => row.jobId === m.successor!.originalJobId), initial.jobs[0]);
      assert.deepEqual(after.prior, initial.prior);
      assert.deepEqual(after.reconciliations, initial.reconciliations); assert.deepEqual(after.counters, initial.counters);
      assert.deepEqual(after.counts, { ...initialCounts, jobs: initialCounts.jobs + 1 });
      await assert.rejects(result.consume(), /Refresh successor date budget consumed/);
      assert.deepEqual(await snapshot(), after);
      const successor = after.jobs.find((row) => row.operation === m.operation)!;
      assert.equal(successor.status, "REQUESTED");
      const changed = await observer.query("update reader_summary_jobs set status='FAILED', failed_at=$2, updated_at=$2 where id=$1 and status='REQUESTED'", [successor.jobId, clock.now()]);
      assert.equal(changed.rowCount, 1);
      const evidence: RefreshReconciliationEvidence = { format: "reader-summary-new-input-refresh-reconciliation-v1", tenantId: m.tenantId, workspaceId: m.workspaceId,
        date: m.date, jobId: successor.jobId, operation: m.operation, manifestSha256: refreshBytesHash(Buffer.from(JSON.stringify(m))),
        reason: "consumed_provider_invocation_without_summary", invocation: { requestId: "fabricated-native-successor", purpose: "social_monitor.relevance.assess_source_content.v1",
          requestSha256: "0".repeat(64), attemptSha256: "1".repeat(64), consumedAt: m.preparedAt, returnedAt: m.preparedAt, outcome: "failed", providerUsageReported: false } };
      const receipt = await reconcileConsumedRefreshJob({ client: db, evidence, evidenceSha256: refreshBytesHash(Buffer.from(JSON.stringify(evidence))), now: clock.now(), ids: new CryptoIdGenerator() });
      const settled = await snapshot();
      await assert.rejects(result.consume(), /Refresh reconciled original history changed/);
      const chainBase = { ...m, successor: { ...m.successor!, originalJobId: successor.jobId, reconciliationId: receipt.reconciliationId, originalManifestJson: JSON.stringify(m) } };
      const chain: RefreshManifest = { ...chainBase, operation: refreshOperation(chainBase) };
      await assert.rejects(consumeRefreshSuccessor({ summary: db, manifest: chain, job: job(chain), clock, assertLocal: () => undefined }), /cannot authorize a successor chain/);
      assert.deepEqual(await snapshot(), settled); await assertUnlocked(observer);
      console.log(JSON.stringify({ status: "passed", engine: "native-postgresql", maxPool: 2, overlaps,
        concurrentCommits: result.concurrentCommits, lockConflicts: result.lockConflicts,
        scenarios: ["once-only-insert", "immutable-original-unknown-usage", "writer-before-holder", "lost-holder", "statement-timeout-unwind", "concurrent-max2", "replay", "reconciled-successor-no-chain"] }));
    });
  } finally { await summary?.close(); await observer.end(); }
}
void main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "failed", code: sqlState(error), frames: error instanceof Error ? error.stack?.split("\n").slice(1, 9) : [] }));
  process.exitCode = 1;
});
