import {
  readerSummaryDailyModelJobIdentity,
} from "../../../domain/value-objects/reader-summary-daily-model-job";
import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionWork,
  ReaderSummaryDailyLease,
} from "../../../ports/reader-summary-daily-execution-cursor.port";

export type ReaderSummaryDailySqlResult<TRow> = Readonly<{
  rows: readonly TRow[];
  rowCount: number | null;
}>;

export interface ReaderSummaryDailySqlTransaction {
  query<TRow extends Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<ReaderSummaryDailySqlResult<TRow>>;
}

export interface ReaderSummaryDailySqlClient extends ReaderSummaryDailySqlTransaction {
  serializable<T>(
    operation: (transaction: ReaderSummaryDailySqlTransaction) => Promise<T>,
  ): Promise<T>;
}

export type ReaderSummaryDailyClaimRow = Readonly<{
  outcome: string;
  tenant_id: string;
  workspace_id: string;
  requested_utc_date: string | null;
  eligible_through: string;
  ingestion_cutoff: Date | string | null;
  source_canonical_bytes: Buffer | null;
  source_canonical_sha256: string | null;
  model_job_state: string | null;
  lease_owner: string | null;
  fencing_token: string | bigint | null;
  leased_at: Date | string | null;
  lease_expires_at: Date | string | null;
  absolute_expires_at: Date | string | null;
  response_bytes: Buffer | null;
  receipt_bytes: Buffer | null;
}>;

export const mapReaderSummaryDailyClaimRow = (
  row: ReaderSummaryDailyClaimRow,
): ReaderSummaryDailyClaimResult => {
  const requestedUtcDate = row.requested_utc_date ?? undefined;
  if (row.outcome === "CAUGHT_UP") {
    return { kind: "caught_up", eligibleThrough: row.eligible_through };
  }
  if (row.outcome === "RECOVERY_REQUIRED" && requestedUtcDate !== undefined) {
    return {
      kind: "recovery_required",
      nextUnresolvedUtcDate: requestedUtcDate,
      eligibleThrough: row.eligible_through,
    };
  }
  if (row.outcome === "LEASED" && requestedUtcDate !== undefined) {
    return { kind: "leased", requestedUtcDate };
  }
  if (row.outcome === "FAILED_AMBIGUOUS" && requestedUtcDate !== undefined) {
    return { kind: "failed_ambiguous", requestedUtcDate };
  }
  if (row.outcome !== "CLAIMED" || requestedUtcDate === undefined) {
    throw new Error("Daily execution cursor returned an unknown outcome");
  }
  const sourceBytes = requiredBuffer(row.source_canonical_bytes, "source bytes");
  const sourceSha = requiredString(row.source_canonical_sha256, "source SHA");
  const work: ReaderSummaryDailyExecutionWork = {
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    requestedUtcDate,
    eligibleThrough: row.eligible_through,
    sourceAuthority: {
      requestedUtcDate,
      ingestionCutoff: iso(row.ingestion_cutoff, "ingestion cutoff"),
      canonicalBytes: sourceBytes,
      canonicalSha256: sourceSha,
    },
    modelJob: readerSummaryDailyModelJobIdentity({
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      requestedUtcDate,
      sourceAuthoritySha256: sourceSha,
    }),
    modelJobState: modelState(row.model_job_state),
    lease: mapReaderSummaryDailyLease(row),
    ...(row.response_bytes === null ? {} : { completedResponseBytes: row.response_bytes }),
    ...(row.receipt_bytes === null ? {} : { completedReceiptBytes: row.receipt_bytes }),
  };
  return { kind: "claimed", work };
};

export const mapReaderSummaryDailyLease = (row: {
  readonly lease_owner: string | null;
  readonly fencing_token: string | bigint | null;
  readonly leased_at: Date | string | null;
  readonly lease_expires_at: Date | string | null;
  readonly absolute_expires_at: Date | string | null;
}): ReaderSummaryDailyLease => ({
  owner: requiredString(row.lease_owner, "lease owner"),
  fencingToken: BigInt(required(row.fencing_token, "fencing token")),
  leasedAt: iso(row.leased_at, "leased at"),
  expiresAt: iso(row.lease_expires_at, "lease expires at"),
  absoluteExpiresAt: iso(row.absolute_expires_at, "absolute expires at"),
});

const modelState = (value: string | null): ReaderSummaryDailyExecutionWork["modelJobState"] => {
  if (["RESERVED", "RUNNING", "COMPLETED", "FAILED_AMBIGUOUS"].includes(value ?? "")) {
    return value as ReaderSummaryDailyExecutionWork["modelJobState"];
  }
  throw new Error("Daily execution cursor returned an invalid model job state");
};

const required = <T>(value: T | null, label: string): T => {
  if (value === null) throw new Error(`Daily execution cursor omitted ${label}`);
  return value;
};
const requiredString = (value: string | null, label: string): string => {
  const result = required(value, label);
  if (result.length === 0) throw new Error(`Daily execution cursor returned empty ${label}`);
  return result;
};
const requiredBuffer = (value: Buffer | null, label: string): Buffer => {
  const result = required(value, label);
  if (result.length === 0) throw new Error(`Daily execution cursor returned empty ${label}`);
  return result;
};
const iso = (value: Date | string | null, label: string): string => {
  const date = value instanceof Date ? value : new Date(required(value, label));
  if (Number.isNaN(date.getTime())) throw new Error(`Daily execution cursor returned invalid ${label}`);
  return date.toISOString();
};
