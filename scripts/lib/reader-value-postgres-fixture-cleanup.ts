import type { Pool } from 'pg';
import { endDailyCursorFixturePool, runDailyCursorFixtureWithCleanup } from './reader-summary-daily-cursor-fixture-cleanup';

/** pg-pool's end promise can settle before its client-end callbacks. Drain the
 * fixture-owned sockets before DDL, and never force-kill a still-ending Prisma
 * socket after the production runtime lease has been released. */
export async function closeReaderValuePostgresFixture(resources: {
  readonly runtimeConnection?: { onApplicationShutdown(): Promise<void> };
  readonly runtime?: Pool;
  readonly setup?: Pool;
  readonly admin: Pool;
  readonly databaseName: string;
  readonly databaseCreated: boolean;
  readonly createdRoles: readonly string[];
}): Promise<void> {
  await runDailyCursorFixtureWithCleanup(async () => {
    await resources.runtimeConnection?.onApplicationShutdown();
    if (resources.runtime) await endDailyCursorFixturePool(resources.runtime);
    if (resources.setup) await endDailyCursorFixturePool(resources.setup);
    if (resources.databaseCreated) {
      // A genuine remaining backend must fail cleanup, rather than receive
      // 57P01 through an idle-client listener after success has been reported.
      await resources.admin.query(`DROP DATABASE "${resources.databaseName}"`);
    }
    for (const role of [...resources.createdRoles].reverse()) {
      await resources.admin.query(`DROP ROLE "${role}"`);
    }
  }, () => endDailyCursorFixturePool(resources.admin));
}
