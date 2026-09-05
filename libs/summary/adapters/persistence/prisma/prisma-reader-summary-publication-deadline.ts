import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";

export const readerSummaryPublicationTimeoutMs = 300_000;

export const configureReaderSummaryPublicationDeadline = async (
  client: Pick<PrismaReaderSummaryClient, "$queryRaw">,
): Promise<void> => {
  // The client transaction timer queues rollback on the same connection; it
  // cannot interrupt a running PostgreSQL statement. Set a server deadline
  // before the guard/publisher, scoped to this transaction. Keep shorter caps.
  await client.$queryRaw`
    SELECT set_config('statement_timeout',
      LEAST(NULLIF(setting::bigint, 0), ${readerSummaryPublicationTimeoutMs})::text,
      true)
    FROM pg_catalog.pg_settings WHERE name = 'statement_timeout'
  `;
};
