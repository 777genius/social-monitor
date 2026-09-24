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
import {
  buildReaderSummaryPublicationRequestV2,
  readerSummaryPublicationHasWeeklyDailyEvidence,
} from "../reader-summary-weekly-publication-evidence";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import { requireSerializableReaderSummaryTransactions,
  runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";
import {
  configureReaderSummaryPublicationDeadline,
  readerSummaryPublicationTimeoutMs,
} from "./prisma-reader-summary-publication-deadline";

const publicationTransactionOptions = Object.freeze({
  maxWait: 30_000,
  timeout: readerSummaryPublicationTimeoutMs,
});

export type ReaderSummaryPublicationTransactionGuard = (
  client: PrismaReaderSummaryClient,
  command: ReaderSummaryPublicationCommand,
) => Promise<void | { readonly allowed: true } | { readonly allowed: false;
  readonly reason: string }>;

export class PrismaReaderSummaryPublication implements ReaderSummaryPublicationPort {
  constructor(
    private readonly prisma: PrismaSummaryClient,
    private readonly transactionGuard?: ReaderSummaryPublicationTransactionGuard,
  ) {}

  async publish(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome> {
    if (command.finalJob.toSnapshot().selectionStrategy === "jev_primary_v3") {
      requireSerializableReaderSummaryTransactions(this.prisma);
    }
    const usesDbOwnedWeeklyEvidence =
      readerSummaryPublicationHasWeeklyDailyEvidence(command);
    const request = usesDbOwnedWeeklyEvidence
      ? buildReaderSummaryPublicationRequestV2(command)
      : buildReaderSummaryPublicationPayload(command);
    const serialized = JSON.stringify(request);
    const transactionResult = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.prisma,
        async (prisma) => {
          await configureReaderSummaryPublicationDeadline(prisma);
          const guard = await this.transactionGuard?.(prisma, command);
          if (guard !== undefined && guard.allowed === false) {
            return { guard } as const;
          }
          const rows = await prisma.$queryRaw<readonly ReaderSummaryPublicationSqlRow[]>`
            SELECT *
            FROM "publish_reader_summary"(${serialized}::jsonb)
          `;
          return { rows } as const;
        },
        publicationTransactionOptions,
      ),
    );
    if ("guard" in transactionResult && transactionResult.guard !== undefined) {
      throw new Error(`Reader summary publication rejected: ${transactionResult.guard.reason}`);
    }
    const rows = transactionResult.rows;
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error("PostgreSQL publication returned no exact outcome");
    }
    if (
      !/^[0-9a-f]{64}$/u.test(row.report_sha256) ||
      !/^[0-9a-f]{64}$/u.test(row.proof_sha256) ||
      (request.schemaVersion === "reader_summary.publication.v1" &&
        (row.report_sha256 !== request.reportSha256 ||
          row.proof_sha256 !== request.proofSha256))
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
      row.publication_id !== request.readerSummaryArtifactId
    ) {
      throw new Error("PostgreSQL publication returned a mismatched identity");
    }

    return row.outcome;
  }
}
