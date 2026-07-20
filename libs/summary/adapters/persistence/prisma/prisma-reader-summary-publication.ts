import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationOutcome,
  ReaderSummaryPublicationPort,
} from "../../../ports";
import {
  buildReaderSummaryPublicationPayload,
  type ReaderSummaryPublicationSqlRow,
} from "../reader-summary-publication-proof";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import { runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";

export type ReaderSummaryPublicationTransactionGuard = (
  client: PrismaReaderSummaryClient,
  command: ReaderSummaryPublicationCommand,
) => Promise<void>;

export class PrismaReaderSummaryPublication implements ReaderSummaryPublicationPort {
  constructor(
    private readonly prisma: PrismaSummaryClient,
    private readonly transactionGuard?: ReaderSummaryPublicationTransactionGuard,
  ) {}

  async publish(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome> {
    const payload = buildReaderSummaryPublicationPayload(command);
    const serialized = JSON.stringify(payload);
    const rows = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(this.prisma, async (prisma) => {
        await this.transactionGuard?.(prisma, command);
        return prisma.$queryRaw<readonly ReaderSummaryPublicationSqlRow[]>`
          SELECT *
          FROM "publish_reader_summary"(${serialized}::jsonb)
        `;
      }),
    );
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error("PostgreSQL publication returned no exact outcome");
    }
    if (
      row.report_sha256 !== payload.reportSha256 ||
      row.proof_sha256 !== payload.proofSha256
    ) {
      throw new Error("PostgreSQL publication returned a mismatched proof");
    }
    if (
      row.outcome !== "published" &&
      row.outcome !== "replayed" &&
      row.outcome !== "stale"
    ) {
      throw new Error("PostgreSQL publication returned an invalid outcome");
    }
    if (
      row.outcome !== "stale" &&
      row.publication_id !== payload.readerSummaryArtifactId
    ) {
      throw new Error("PostgreSQL publication returned a mismatched identity");
    }

    return row.outcome;
  }
}
