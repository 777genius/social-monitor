import type {
  ReaderSummaryDailyExecutionCursorClaim,
  ReaderSummaryDailyExecutionCursorPort,
  ReaderSummaryDailyLease,
} from "../../../ports/reader-summary-daily-execution-cursor.port";
import type {
  ReaderSummaryDailyBoundedMaintenanceClaim,
  ReaderSummaryDailyBoundedMaintenanceClaimPort,
} from "../../../ports/reader-summary-daily-bounded-maintenance-claim.port";
import {
  mapReaderSummaryDailyBoundedMaintenanceClaimRow,
  mapReaderSummaryDailyClaimRow,
  mapReaderSummaryDailyLease,
  type ReaderSummaryDailyClaimRow,
  type ReaderSummaryDailySqlClient,
  type ReaderSummaryDailySqlTransaction,
} from "./prisma-reader-summary-daily-execution-cursor-row";

const claimSql = `
  SELECT *
  FROM claim_reader_summary_daily_execution(
    $1::UUID, $2::UUID, $3::TEXT, $4::DATE, $5::TIMESTAMPTZ
  )`;
const boundedMaintenanceClaimSql = `
  SELECT *
  FROM claim_reader_summary_daily_execution_bounded_maintenance(
    $1::UUID, $2::UUID, $3::TEXT, $4::DATE, $5::TIMESTAMPTZ
  )`;
const renewSql = `
  SELECT *
  FROM renew_reader_summary_daily_execution_lease(
    $1::UUID, $2::UUID, $3::DATE, $4::TEXT, $5::BIGINT, $6::TIMESTAMPTZ
  )`;
const runningSql = `
  SELECT mark_reader_summary_daily_model_job_running(
    $1::UUID, $2::UUID, $3::DATE, $4::TEXT, $5::BIGINT, $6::TIMESTAMPTZ
  )`;
const completeSql = `
  SELECT complete_reader_summary_daily_model_job_v2(
    $1::UUID, $2::UUID, $3::DATE, $4::TEXT, $5::BIGINT, $6::TIMESTAMPTZ,
    $7::BYTEA, $8::CHAR(64), $9::JSONB, $10::BYTEA, $11::CHAR(64),
    $12::BYTEA, $13::CHAR(64), $14::BIGINT, $15::BIGINT,
    $16::BIGINT, $17::TEXT, $18::BIGINT
  )`;
const finalizeSql = `
  SELECT finalize_reader_summary_daily_publication(
    $1::UUID, $2::UUID, $3::DATE, $4::TEXT, $5::BIGINT, $6::TIMESTAMPTZ,
    $7::UUID, $8::UUID, $9::UUID, $10::CHAR(64), $11::CHAR(64),
    $12::CHAR(64), $13::BYTEA, $14::CHAR(64), $15::BYTEA, $16::CHAR(64)
  )`;

export class PrismaReaderSummaryDailyExecutionCursor implements
  ReaderSummaryDailyExecutionCursorPort,
  ReaderSummaryDailyBoundedMaintenanceClaimPort {
  constructor(
    private readonly client: ReaderSummaryDailySqlClient,
    private readonly maxSerializableAttempts = 4,
  ) {
    if (!Number.isInteger(maxSerializableAttempts) || maxSerializableAttempts < 1) {
      throw new Error("Daily execution cursor retry attempts must be positive");
    }
  }

  claimNext(input: ReaderSummaryDailyExecutionCursorClaim) {
    return this.serializable(async (transaction) => {
      const result = await transaction.query<ReaderSummaryDailyClaimRow>(claimSql, [
        input.tenantId,
        input.workspaceId,
        input.workerId,
        input.firstUnresolvedUtcDate,
        input.invokedAt,
      ]);
      return mapReaderSummaryDailyClaimRow(exactlyOne(result.rows, "claim"));
    });
  }

  claimExactBoundedMaintenance(input: ReaderSummaryDailyBoundedMaintenanceClaim) {
    return this.serializable(async (transaction) => {
      const result = await transaction.query<ReaderSummaryDailyClaimRow>(
        boundedMaintenanceClaimSql,
        [
          input.tenantId,
          input.workspaceId,
          input.workerId,
          input.requestedUtcDate,
          input.invokedAt,
        ],
      );
      return mapReaderSummaryDailyBoundedMaintenanceClaimRow(
        exactlyOne(result.rows, "bounded maintenance claim"),
      );
    });
  }

  renewLease(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly requestedUtcDate: string;
    readonly fencingToken: bigint;
    readonly renewedAt: string;
  }): Promise<ReaderSummaryDailyLease> {
    return this.serializable(async (transaction) => {
      const result = await transaction.query<{
        lease_owner: string | null;
        fencing_token: string | bigint | null;
        leased_at: Date | string | null;
        lease_expires_at: Date | string | null;
        absolute_expires_at: Date | string | null;
      }>(renewSql, [
        input.tenantId,
        input.workspaceId,
        input.requestedUtcDate,
        input.workerId,
        input.fencingToken.toString(),
        input.renewedAt,
      ]);
      return mapReaderSummaryDailyLease(exactlyOne(result.rows, "renewal"));
    });
  }

  markRunning(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly requestedUtcDate: string;
    readonly fencingToken: bigint;
    readonly startedAt: string;
  }): Promise<void> {
    return this.serializable(async (transaction) => {
      const result = await transaction.query<Record<string, unknown>>(runningSql, [
        input.tenantId,
        input.workspaceId,
        input.requestedUtcDate,
        input.workerId,
        input.fencingToken.toString(),
        input.startedAt,
      ]);
      exactlyOne(result.rows, "RUNNING transition");
    });
  }

  complete(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly requestedUtcDate: string;
    readonly fencingToken: bigint;
    readonly completedAt: string;
    readonly responseBytes: Uint8Array;
    readonly responseSha256: string;
    readonly attestation: Readonly<Record<string, unknown>>;
    readonly attestationBytes: Uint8Array;
    readonly attestationSha256: string;
    readonly receiptBytes: Uint8Array;
    readonly receiptSha256: string;
    readonly modelTelemetry: Parameters<
      ReaderSummaryDailyExecutionCursorPort["complete"]
    >[0]["modelTelemetry"];
  }): Promise<void> {
    return this.serializable(async (transaction) => {
      const result = await transaction.query<Record<string, unknown>>(completeSql, [
        input.tenantId,
        input.workspaceId,
        input.requestedUtcDate,
        input.workerId,
        input.fencingToken.toString(),
        input.completedAt,
        input.responseBytes,
        input.responseSha256,
        input.attestation,
        input.attestationBytes,
        input.attestationSha256,
        input.receiptBytes,
        input.receiptSha256,
        input.modelTelemetry.inputTokens,
        input.modelTelemetry.outputTokens,
        input.modelTelemetry.totalTokens,
        input.modelTelemetry.usageSource,
        input.modelTelemetry.durationMs,
      ]);
      exactlyOne(result.rows, "COMPLETED transition");
    });
  }

  finalizePublication(input: Parameters<
    ReaderSummaryDailyExecutionCursorPort["finalizePublication"]
  >[0]): Promise<void> {
    return this.serializable(async (transaction) => {
      const publication = input.publication;
      const result = await transaction.query<Record<string, unknown>>(finalizeSql, [
        input.tenantId,
        input.workspaceId,
        input.requestedUtcDate,
        input.workerId,
        input.fencingToken.toString(),
        input.finalizedAt,
        publication.readerSummaryJobId,
        publication.readerSummaryArtifactId,
        publication.publicationId,
        publication.reportSha256,
        publication.proofSha256,
        publication.weeklyEvidenceSha256,
        publication.publicEvidenceBytes,
        publication.publicEvidenceSha256,
        publication.publicFrontendBytes,
        publication.publicFrontendSha256,
      ]);
      exactlyOne(result.rows, "publication finalization");
    });
  }

  private async serializable<T>(
    operation: (transaction: ReaderSummaryDailySqlTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.client.serializable(operation);
      } catch (error) {
        if (attempt >= this.maxSerializableAttempts || !isRetryable(error)) throw error;
      }
    }
  }
}

const exactlyOne = <TRow>(rows: readonly TRow[], operation: string): TRow => {
  if (rows.length !== 1) {
    throw new Error(`Daily execution cursor ${operation} did not return exactly one row`);
  }
  return rows[0]!;
};

const isRetryable = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "40001" || error.code === "40P01";
};
