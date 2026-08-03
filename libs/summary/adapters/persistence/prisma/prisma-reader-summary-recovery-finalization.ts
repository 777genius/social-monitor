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
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import { verifyReaderSummaryDailyCanonicalRecoveryV4Provenance } from "./prisma-reader-summary-artifact.repository";
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

export type ReaderSummaryDailyCanonicalRecoveryCapture = (
  input: ReaderSummaryDailyCanonicalRecoveryFinalizationInput,
  prisma: PrismaReaderSummaryClient,
) => Promise<ReaderSummaryDailyCanonicalRecoveryCapturedPublication>;

export type ReaderSummaryDailyCanonicalRecoveryFinalizationInput = Readonly<{
  work: Readonly<{
    tenantId: string;
    workspaceId: string;
    requestedUtcDate:
      | "2026-07-23" | "2026-07-24" | "2026-07-25" | "2026-07-26"
      | "2026-07-27" | "2026-07-28" | "2026-07-29" | "2026-07-30";
    sourceAuthoritySha256: string;
    modelJobIdentity: string;
    workerId: string;
    sourceAuthorityBytes: Buffer;
    state: "RESERVED" | "COMPLETED" | "PUBLICATION_PENDING" | "FINALIZED";
    fencingToken: bigint;
    leasedAt: string;
    leaseExpiresAt: string;
    absoluteExpiresAt: string;
    completedAt?: string;
    responseBytes?: Buffer;
    receiptBytes?: Buffer;
  }>;
  responseBytes: Buffer;
  receiptBytes: Buffer;
}>;

export type ReaderSummaryDailyCanonicalRecoveryCapturedPublication = Readonly<{
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  publicationId: string;
  reportSha256: string;
  proofSha256: string;
  weeklyEvidenceSha256: string;
  publicEvidenceSha256: string;
  publicFrontendSha256: string;
  publicEvidenceBytes: Buffer;
  publicFrontendBytes: Buffer;
}>;

export type ReaderSummaryDailyCanonicalRecoveryStage = (
  input: ReaderSummaryDailyCanonicalRecoveryFinalizationInput,
  publication: ReaderSummaryDailyCanonicalRecoveryCapturedPublication,
) => Promise<Readonly<{
  publish(): Promise<void>;
  cleanup(): Promise<void>;
}>>;

/**
 * Captures the private database publication and fences it as PUBLICATION_PENDING
 * in one serializable transaction. Files are staged privately and published only
 * after that commit; a second fenced transaction records FINALIZED after readback.
 */
export class PrismaReaderSummaryDailyCanonicalRecoveryV4Finalization {
  constructor(
    private readonly prisma: PrismaSummaryClient,
    private readonly capture: ReaderSummaryDailyCanonicalRecoveryCapture,
    private readonly stage: ReaderSummaryDailyCanonicalRecoveryStage,
  ) {}

  async finalize(input: ReaderSummaryDailyCanonicalRecoveryFinalizationInput) {
    const publication = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.prisma,
        async (transaction) => {
          const captured = await this.capture(input, transaction);
          const provenanceVerified =
            await verifyReaderSummaryDailyCanonicalRecoveryV4Provenance({
              prisma: transaction,
              readerSummaryArtifactId: captured.readerSummaryArtifactId,
            });
          if (!provenanceVerified) {
            throw new Error(
              "Daily canonical recovery final publication provenance was not re-verified",
            );
          }
          const rows = await transaction.$queryRaw<readonly { sealed: boolean }[]>`
            SELECT public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
              ${input.work.tenantId}::UUID,
              ${input.work.workspaceId}::UUID,
              ${input.work.requestedUtcDate}::DATE,
              ${input.work.workerId}::TEXT,
              ${input.work.fencingToken}::BIGINT,
              ${captured.readerSummaryJobId}::UUID,
              ${captured.readerSummaryArtifactId}::UUID,
              ${captured.publicationId}::UUID,
              ${captured.reportSha256}::CHAR(64),
              ${captured.proofSha256}::CHAR(64),
              ${captured.weeklyEvidenceSha256}::CHAR(64),
              ${captured.publicEvidenceSha256}::CHAR(64),
              ${captured.publicFrontendSha256}::CHAR(64)
            ) AS sealed
          `;
          if (rows.length !== 1 || rows[0]?.sealed !== true) {
            throw new Error("Daily canonical recovery publication was not durably prepared");
          }
          return captured;
        },
        recoveryFinalizationTransactionOptions,
      ),
    );
    const staged = await this.stage(input, publication);
    try {
      await staged.publish();
      await withPrismaWriteRetry(() =>
        runSerializableReaderSummaryTransaction(
          this.prisma,
          async (transaction) => {
            const rows = await transaction.$queryRaw<readonly { sealed: boolean }[]>`
              SELECT public."finalize_reader_summary_daily_canonical_recovery_v4"(
                ${input.work.tenantId}::UUID,
                ${input.work.workspaceId}::UUID,
                ${input.work.requestedUtcDate}::DATE,
                ${input.work.workerId}::TEXT,
                ${input.work.fencingToken}::BIGINT,
                ${publication.readerSummaryJobId}::UUID,
                ${publication.readerSummaryArtifactId}::UUID,
                ${publication.publicationId}::UUID,
                ${publication.reportSha256}::CHAR(64),
                ${publication.proofSha256}::CHAR(64),
                ${publication.weeklyEvidenceSha256}::CHAR(64),
                ${publication.publicEvidenceSha256}::CHAR(64),
                ${publication.publicFrontendSha256}::CHAR(64)
              ) AS sealed
            `;
            if (rows.length !== 1 || rows[0]?.sealed !== true) {
              throw new Error("Daily canonical recovery finalization was not sealed");
            }
          },
          recoveryFinalizationTransactionOptions,
        ),
      );
    } catch (error) {
      // A DB client error after publish is ambiguous: the fenced FINALIZED
      // transaction could already have committed. Preserve immutable public
      // files so FINALIZED readback never points to missing evidence.
      await staged.cleanup();
      throw error;
    }
    await staged.cleanup();
    return Object.freeze({
      requestedUtcDate: input.work.requestedUtcDate,
      sourceAuthoritySha256: input.work.sourceAuthoritySha256,
      modelJobIdentity: input.work.modelJobIdentity,
      readerSummaryJobId: publication.readerSummaryJobId,
      readerSummaryArtifactId: publication.readerSummaryArtifactId,
      publicationId: publication.publicationId,
      reportSha256: publication.reportSha256,
      proofSha256: publication.proofSha256,
      weeklyEvidenceSha256: publication.weeklyEvidenceSha256,
      publicEvidenceSha256: publication.publicEvidenceSha256,
      publicFrontendSha256: publication.publicFrontendSha256,
    });
  }
}
