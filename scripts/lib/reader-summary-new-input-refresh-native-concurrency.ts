/** Native fixture ONLY. This independent writer is not part of the runtime pool. */
import assert from "node:assert/strict";
import { Client } from "pg";
import type { Clock } from "@social-monitor/shared-kernel";
import type { ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import { withRefreshPublicationLocks } from "./reader-summary-new-input-refresh-publication-lock";
import { assertRefreshTransactionAuthority, refreshPublicationGuard } from "./reader-summary-new-input-refresh-execution";
import { assertRefreshManifest, refreshScope, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

const tables = ["source_item_engagement_snapshots", "source_items", "feed_items",
  "source_item_engagement_observations", "source_item_engagement_daily_rollups", "source_bindings",
  "interests", "source_catalog_entries", "reader_summary_policies"] as const;
const lockUnavailable = (error: unknown): boolean => {
  const value = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
  return value.code === "55P03" || value.meta?.code === "55P03" ||
    value.meta?.driverAdapterError?.cause?.originalCode === "55P03";
};

export async function runRefreshNativeConcurrency(input: {
  url: string; summary: PrismaSummaryConnection; manifest: RefreshManifest;
  command: ReaderSummaryPublicationCommand; clock: Clock;
}): Promise<{ publicationMs: number; writerConflicts: number; acquisitionMs: number[] }> {
  assert.match(decodeURIComponent(new URL(input.url).pathname.slice(1)), /^reader_summary_refresh_test_[a-z0-9]+$/u);
  const { summary, manifest: m, command, clock } = input;
  const writer = new Client({ connectionString: input.url });
  const scope = [refreshScope.tenantId, refreshScope.workspaceId];
  const where = "tenant_id=$1::uuid and workspace_id=$2::uuid";
  const local = () => assertRefreshManifest(m, clock.now());
  const publish = (connection: Pick<PrismaSummaryConnection, "$transaction">, blockedWriter = false) =>
    withRefreshPublicationLocks(connection, (assertProtected) => {
      const guard = refreshPublicationGuard({ manifest: m, jobId: command.finalJob.toSnapshot().id,
        assertLocal: local, assertProtected,
        assertCurrent: (tx) => assertRefreshTransactionAuthority(tx, m, command.finalJob.toSnapshot().id, clock) });
      return new PrismaReaderSummaryPublication(summary, async (tx, value) => {
        if (blockedWriter) {
          // Publisher deadline/tenant SELECTs have established its real snapshot.
          // An independent writer must NOT commit policy drift at this seam.
          await writer.query("begin");
          try {
            await writer.query("set local lock_timeout = '200ms'");
            await assert.rejects(writer.query(`update reader_summary_policies set tone=tone where ${where}`, scope), lockUnavailable);
          } finally { await writer.query("rollback"); }
        }
        await guard(tx, value);
      }).publish(command);
    });
  await writer.connect();
  try {
    // A commit AFTER the holder's snapshot but BEFORE locks must be visible in
    // the separate normal publisher's first validation snapshot.
    const original = await writer.query<{ tone: string }>(`select tone from reader_summary_policies where ${where} and scope_key='workspace'`, scope);
    assert.equal(original.rowCount, 1);
    const tone = original.rows[0]!.tone;
    try {
      await assert.rejects(publish({ $transaction: (work, options) => summary.$transaction(async (tx) => {
        await tx.$queryRaw`select 1 as holder_snapshot`;
        const changed = await writer.query(`update reader_summary_policies set tone=$3 where ${where} and scope_key='workspace'`,
          [...scope, tone === "analytical" ? "neutral" : "analytical"]);
        assert.equal(changed.rowCount, 1); // Autocommit completed on independent client.
        return work(tx);
      }, options) }), /drifted/);
    } finally {
      await writer.query(`update reader_summary_policies set tone=$3 where ${where} and scope_key='workspace'`, [...scope, tone]);
    }

    // Every protected relation can be first in another writer's transaction.
    // NOWAIT must unwind all partial locks without a publisher or a deadlock.
    let writerConflicts = 0;
    const acquisitionMs: number[] = [];
    for (const table of tables) {
      await writer.query("begin");
      try {
        await writer.query(`lock table ${table} in row exclusive mode`);
        if (table === "source_item_engagement_snapshots") {
          for (const name of ["source_item_engagement_snapshots", "source_items"] as const) {
            const updated = await writer.query(`update ${name} set last_observed_at=last_observed_at where ${where}`, scope);
            assert((updated.rowCount ?? 0) > 0);
          }
        }
        let publisherStarted = false;
        const attemptedAt = Date.now();
        await assert.rejects(withRefreshPublicationLocks({ $transaction: (work, options) => summary.$transaction(async (tx) => {
          // A regression must fail quickly instead of hanging the entire gate.
          await tx.$queryRaw`select set_config('lock_timeout', '1000ms', true)`;
          return work(tx);
        }, options) }, async () => { publisherStarted = true; }), lockUnavailable);
        const elapsed = Date.now() - attemptedAt;
        assert(elapsed < 750, "NOWAIT must reject before the 1000ms lock timeout");
        acquisitionMs.push(elapsed);
        assert.equal(publisherStarted, false);
        // Proves failed acquisition released EVERY conflicting partial lock.
        await writer.query(`lock table ${tables.join(", ")} in row exclusive mode nowait`);
        if (table === "source_item_engagement_snapshots") {
          const updated = await writer.query(`update feed_items set title=title where ${where}`, scope);
          assert((updated.rowCount ?? 0) > 0); // snapshot -> source -> feed writer progresses.
        }
        writerConflicts++;
      } finally { await writer.query("rollback"); }
    }
    const started = Date.now();
    assert.equal(await publish(summary, true), "published");
    const publicationMs = Date.now() - started;
    assert(publicationMs < 30_000, "shared max2 publication must complete without nested/root reads");
    return { publicationMs, writerConflicts, acquisitionMs };
  } finally { await writer.end(); }
}
