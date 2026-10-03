import { runWithTenantDatabaseAccess, withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type { PrismaTransactionalSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";

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
    // READ COMMITTED is deliberate and firstpub-only: tenant middleware runs
    // SELECT set_config before this callback. The VOLATILE DB contract takes
    // EXCLUSIVE locks, then checks all five claims with a fresh SQL snapshot.
    const rows = await tx.$queryRaw<readonly { reserved: boolean }[]>`
      select public.reserve_reader_summary_first_publication(
        ${day.tenantId}::uuid, ${day.workspaceId}::uuid,
        ${new Date(day.startedAt)}, ${new Date(day.endedAt)}, ${reservedAt}) as reserved
    `;
    if (rows.length !== 1 || rows[0]?.reserved !== true) {
      throw new Error("First publication reservation did not return an exact durable claim");
    }
  }, { isolationLevel: "ReadCommitted", maxWait: 30_000, timeout: 30_000 })));
}
