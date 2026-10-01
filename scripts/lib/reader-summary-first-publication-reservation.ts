import { runWithTenantDatabaseAccess, withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type { PrismaTransactionalSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";

export type FirstPublicationDay = Readonly<{
  tenantId: string; workspaceId: string; startedAt: string; endedAt: string;
}>;

/** Empty publication slots are durable consumed day claims. Reservation ONLY
 * inserts; normal publication later fills the slot through its existing CAS.
 * No failed/unknown attempt can reclaim an empty slot. The day key contains
 * neither a manifest hash nor a retry identity. */
export async function reserveFirstPublicationDay(
  client: PrismaTransactionalSummaryClient, day: FirstPublicationDay, reservedAt: Date,
): Promise<void> {
  const start = Date.parse(day.startedAt), end = Date.parse(day.endedAt);
  if (![start, end, reservedAt.getTime()].every(Number.isFinite) || start % 86_400_000 !== 0 ||
      end - start !== 86_400_000 || end > reservedAt.getTime() ||
      new Date(start).toISOString() !== day.startedAt || new Date(end).toISOString() !== day.endedAt) {
    throw new Error("First publication reservation requires one completed canonical UTC day");
  }
  if (typeof client.$transaction !== "function") throw new Error("First publication requires durable transactions");
  await runWithTenantDatabaseAccess(day, () => withPrismaWriteRetry(() => client.$transaction(async (tx) => {
    await lockFirstPublicationClaims(tx);
    const rows = await tx.$queryRaw<readonly { claims: bigint | number }[]>`
      select (
        (select count(*) from reader_summary_jobs where tenant_id = ${day.tenantId}::uuid
          and workspace_id = ${day.workspaceId}::uuid and period_started_at >= ${new Date(day.startedAt)}
          and period_started_at < ${new Date(day.endedAt)}) +
        (select count(*) from reader_summary_artifacts where tenant_id = ${day.tenantId}::uuid
          and workspace_id = ${day.workspaceId}::uuid and period_started_at >= ${new Date(day.startedAt)}
          and period_started_at < ${new Date(day.endedAt)}) +
        (select count(*) from reader_summary_publications where tenant_id = ${day.tenantId}::uuid
          and workspace_id = ${day.workspaceId}::uuid and period_started_at >= ${new Date(day.startedAt)}
          and period_started_at < ${new Date(day.endedAt)}) +
        (select count(*) from reader_summary_publication_slots where tenant_id = ${day.tenantId}::uuid
          and workspace_id = ${day.workspaceId}::uuid and period_started_at >= ${new Date(day.startedAt)}
          and period_started_at < ${new Date(day.endedAt)}) +
        (select count(*) from reader_summary_daily_model_jobs where tenant_id = ${day.tenantId}::uuid
          and workspace_id = ${day.workspaceId}::uuid and requested_utc_date = ${day.startedAt.slice(0, 10)}::date)
      ) as claims
    `;
    if (rows.length !== 1 || rows[0] === undefined || Number(rows[0].claims) !== 0) {
      throw new Error("First publication day already claimed, including failed or uncertain attempts");
    }
    await tx.$queryRaw`
      insert into reader_summary_publication_slots (tenant_id, workspace_id, scope_type, scope_key,
        cadence, period_started_at, period_ended_at, period_timezone, current_publication_id, updated_at)
      values (${day.tenantId}::uuid, ${day.workspaceId}::uuid, 'workspace', 'workspace', 'daily',
        ${new Date(day.startedAt)}, ${new Date(day.endedAt)}, 'UTC', null, ${reservedAt})
    `;
  }, { isolationLevel: "Serializable", maxWait: 30_000, timeout: 30_000 })));
}

async function lockFirstPublicationClaims(client: PrismaReaderSummaryClient): Promise<void> {
  if (!("$executeRaw" in client) || typeof client.$executeRaw !== "function") {
    throw new Error("First publication reservation requires transaction locks");
  }
  const locking = client as PrismaReaderSummaryClient & {
    $executeRaw(query: TemplateStringsArray): Promise<number>;
  };
  // Existing writers do not share an advisory lock protocol. Lock all five
  // relations against writes while checking and inserting. NOWAIT avoids lock
  // order deadlocks. A conflict aborts before effects. This is intentionally
  // brief and conservative, not a claim of global single-writer execution.
  await locking.$executeRaw`lock table reader_summary_jobs, reader_summary_artifacts,
    reader_summary_publications, reader_summary_publication_slots,
    reader_summary_daily_model_jobs in exclusive mode nowait`;
}
