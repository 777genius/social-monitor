export const readerSummaryTelemetryMigration =
  "20260824120000_reader_summary_daily_model_job_telemetry";
export const readerSummaryTelemetryOldChecksum =
  "e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad";
export const readerSummaryTelemetryCorrectedChecksum =
  "575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250";

export const reviewedTelemetryFailureLog = `A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve

Migration name: 20260824120000_reader_summary_daily_model_job_telemetry

Database error code: 42501

Database error:
ERROR: permission denied for schema public

DbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42501), message: "permission denied for schema public", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("aclchk.c"), line: Some(<server-line>), routine: Some("aclcheck_error") }
`;

export type ReaderSummaryTelemetryHistoryState =
  | "clean"
  | "corrected"
  | "invalid"
  | "recovered"
  | "recovery-required"
  | "resolved";

export type ReaderSummaryTelemetryMigrationRow = Readonly<{
  applied_steps_count: number;
  checksum: string;
  finished_at: Date | string | null;
  id: string;
  logs: string | null;
  rolled_back_at: Date | string | null;
  started_at: Date | string;
}>;

export const normalizeReviewedTelemetryFailureLog = (logs: string): string =>
  logs.replaceAll("\r\n", "\n")
    .replace(/line: Some\([0-9]+\)/gu, "line: Some(<server-line>)")
    .replace(/\n+$/u, "\n");

export const isReviewedTelemetryFailureLog = (logs: string): boolean =>
  normalizeReviewedTelemetryFailureLog(logs) === reviewedTelemetryFailureLog;

export const classifyReaderSummaryTelemetryMigrationHistory = (
  input: readonly ReaderSummaryTelemetryMigrationRow[],
): ReaderSummaryTelemetryHistoryState => {
  const rows = [...input];
  if (rows.length === 0) return "clean";
  if (rows.length === 1) {
    const row = rows[0];
    if (row !== undefined && isExactUnfinishedFailure(row)) {
      return "recovery-required";
    }
    if (row !== undefined && isExactResolvedFailure(row)) return "resolved";
    if (row !== undefined && isExactCorrectedSuccess(row)) return "corrected";
    return "invalid";
  }
  if (rows.length !== 2) return "invalid";
  const historical = rows.find((row) =>
    row.checksum === readerSummaryTelemetryOldChecksum);
  const corrected = rows.find((row) =>
    row.checksum === readerSummaryTelemetryCorrectedChecksum);
  return historical !== undefined && corrected !== undefined &&
    isExactResolvedFailure(historical) && isExactCorrectedSuccess(corrected) &&
    timestamp(historical.rolled_back_at) <= timestamp(corrected.started_at)
    ? "recovered"
    : "invalid";
};

const isExactFailureBase = (row: ReaderSummaryTelemetryMigrationRow): boolean =>
  row.checksum === readerSummaryTelemetryOldChecksum &&
  row.applied_steps_count === 0 && row.finished_at === null &&
  typeof row.logs === "string" && isReviewedTelemetryFailureLog(row.logs);

const isExactUnfinishedFailure = (
  row: ReaderSummaryTelemetryMigrationRow,
): boolean => isExactFailureBase(row) && row.rolled_back_at === null;

const isExactResolvedFailure = (
  row: ReaderSummaryTelemetryMigrationRow,
): boolean => isExactFailureBase(row) && row.rolled_back_at !== null &&
  timestamp(row.started_at) <= timestamp(row.rolled_back_at);

const isExactCorrectedSuccess = (
  row: ReaderSummaryTelemetryMigrationRow,
): boolean => row.checksum === readerSummaryTelemetryCorrectedChecksum &&
  row.applied_steps_count === 1 && row.logs === null &&
  row.finished_at !== null && row.rolled_back_at === null &&
  timestamp(row.started_at) <= timestamp(row.finished_at);

const timestamp = (value: Date | string | null): number => {
  if (value === null) return Number.NaN;
  const resolved = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(resolved) ? resolved : Number.NaN;
};
