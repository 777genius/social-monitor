import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import type {
  ReaderSummaryRecoveryFinalizationCommand,
  ReaderSummaryRecoveryFinalizationOutcome,
  ReaderSummaryRecoveryFinalizationPort,
} from "../../../ports";
import { buildReaderSummaryPublicationPayload } from "../reader-summary-publication-proof";
import {
  buildReaderSummaryRecoveryReceiptPayload,
  type ReaderSummaryRecoveryFinalizationSqlRow,
} from "../reader-summary-recovery-receipt";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
} from "./prisma-summary-transaction";

const recoveryFinalizationTransactionOptions: PrismaSummaryTransactionOptions =
  Object.freeze({
    maxWait: 30_000,
    timeout: 300_000,
  });

export class PrismaReaderSummaryRecoveryFinalization
  implements ReaderSummaryRecoveryFinalizationPort
{
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async finalize(
    command: ReaderSummaryRecoveryFinalizationCommand,
  ): Promise<ReaderSummaryRecoveryFinalizationOutcome> {
    const publication = buildReaderSummaryPublicationPayload(
      command.publication,
    );
    const receipt = buildReaderSummaryRecoveryReceiptPayload({
      publication,
      provenance: command.provenance,
    });
    const serializedPublication = JSON.stringify(publication);
    const serializedReceipt = JSON.stringify(receipt);
    const rows = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.prisma,
        (prisma) =>
          prisma.$queryRaw<readonly ReaderSummaryRecoveryFinalizationSqlRow[]>`
            SELECT *
            FROM "finalize_reader_summary_recovery"(
              ${serializedPublication}::jsonb,
              ${serializedReceipt}::jsonb
            )
          `,
        recoveryFinalizationTransactionOptions,
      ),
    );
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error("PostgreSQL recovery finalization returned no outcome");
    }
    if (row.outcome !== "published" && row.outcome !== "replayed") {
      throw new Error(
        "PostgreSQL recovery finalization returned an invalid outcome",
      );
    }
    if (
      row.publication_id !== publication.readerSummaryArtifactId ||
      row.receipt_id !== publication.readerSummaryArtifactId
    ) {
      throw new Error(
        "PostgreSQL recovery finalization returned a mismatched identity",
      );
    }
    if (
      row.report_sha256 !== publication.reportSha256 ||
      row.proof_sha256 !== publication.proofSha256 ||
      row.provenance_sha256 !== receipt.provenanceSha256 ||
      row.receipt_sha256 !== receipt.receiptSha256
    ) {
      throw new Error(
        "PostgreSQL recovery finalization returned a mismatched proof",
      );
    }
    return row.outcome;
  }
}
