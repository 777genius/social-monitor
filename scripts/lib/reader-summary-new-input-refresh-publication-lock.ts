import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { readerSummaryPublicationTimeoutMs } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication-deadline";
import { lockRefreshAuthority } from "./reader-summary-new-input-refresh-postgres";

export type RefreshSnapshotProtection = (tx: PrismaReaderSummaryClient) => Promise<void>;

/** One holder plus the ordinary publisher, using the existing shared max2 pool.
 * Start publish in the CALLER's async context: invoking it inside $transaction
 * leaks the runtime's transaction AsyncLocalStorage and forbids root access. */
export async function withRefreshPublicationLocks<T>(
  summary: Pick<PrismaSummaryConnection, "$transaction">,
  publish: (assertProtected: RefreshSnapshotProtection) => Promise<T>,
): Promise<T> {
  let acquired!: () => void, failed!: (error: unknown) => void, release!: () => void;
  let identity: { pid: number; vxid: string } | undefined;
  let held = false;
  const ready = new Promise<void>((resolve, reject) => { acquired = resolve; failed = reject; });
  const finished = new Promise<void>((resolve) => { release = resolve; });
  const holder = summary.$transaction(async (tx) => {
    await lockRefreshAuthority(tx);
    const rows = await tx.$queryRaw<readonly { pid: number; vxid: string }[]>`
      select pid, virtualxid as vxid from pg_catalog.pg_locks
      where pid = pg_backend_pid() and locktype = 'virtualxid' and granted
    `;
    if (rows.length !== 1 || !rows[0]) throw new Error("Refresh lock holder identity unavailable");
    identity = rows[0]; held = true; acquired();
    await finished;
  }, { isolationLevel: "Serializable", maxWait: 30_000, timeout: readerSummaryPublicationTimeoutMs + 60_000 });
  void holder.catch((error: unknown) => { held = false; failed(error); });
  try {
    await ready;
    return await publish(async (tx) => {
      if (!held || !identity) throw new Error("Refresh snapshot protection was lost");
      // Transfer protection to the publisher itself. pg_locks is live, not an
      // MVCC read: prove overlap even if holder timeout/disconnect notification
      // has not reached JS yet. A lost holder can never validate an old snapshot.
      await lockRefreshAuthority(tx);
      const rows = await tx.$queryRaw<readonly { held: boolean }[]>`
        select exists(select 1 from pg_catalog.pg_locks
          where pid = ${identity.pid} and virtualxid = ${identity.vxid}
            and locktype = 'virtualxid' and granted) as held
      `;
      if (!held || rows.length !== 1 || rows[0]?.held !== true) {
        throw new Error("Refresh snapshot protection was lost");
      }
    });
  } finally {
    held = false; release();
    await holder;
  }
}
