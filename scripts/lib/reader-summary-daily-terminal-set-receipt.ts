import {
  canonicalInvalidProductRetrySetSha256,
  invalidProductRetryDates,
  invalidProductRetrySetToken,
  type InvalidProductRetryDate,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";

export const readerSummaryDailyTerminalSetReceiptSchemaVersion =
  "reader_summary.daily_terminal_set_receipt.v1" as const;

export const readerSummaryDailyTerminalSetReceiptTenantId =
  "00000000-0000-7000-8000-000000000901" as const;
export const readerSummaryDailyTerminalSetReceiptWorkspaceId =
  "00000000-0000-7000-8000-000000000902" as const;

export type ReaderSummaryDailyTerminalSetRow = Readonly<{
  requestedUtcDate: string;
  outcome: string;
  reasonCode: string | null;
  attemptOrdinal: string | number | null;
  modelJobIdentity: string;
  sourceAuthoritySha256: string;
}>;

export type ReaderSummaryDailyTerminalSetReceipt = Readonly<{
  schemaVersion: typeof readerSummaryDailyTerminalSetReceiptSchemaVersion;
  retrySetToken: typeof invalidProductRetrySetToken;
  tenantId: typeof readerSummaryDailyTerminalSetReceiptTenantId;
  workspaceId: typeof readerSummaryDailyTerminalSetReceiptWorkspaceId;
  requestedUtcDates: typeof invalidProductRetryDates;
  terminalCount: 6;
  terminalSetSha256: string;
}>;

type ReceiptSqlClient = Readonly<{
  query<TRow extends Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

export const readerSummaryDailyTerminalSetReceiptKeys = Object.freeze([
  "schemaVersion", "retrySetToken", "tenantId", "workspaceId",
  "requestedUtcDates", "terminalCount", "terminalSetSha256",
] as const);

export const readReaderSummaryDailyTerminalSetRows = async (
  client: ReceiptSqlClient,
): Promise<readonly ReaderSummaryDailyTerminalSetRow[]> => {
  const result = await client.query<ReaderSummaryDailyTerminalSetRow>(`
    SELECT
      to_char(terminal.requested_utc_date, 'YYYY-MM-DD') AS "requestedUtcDate",
      terminal.outcome,
      terminal.reason_code AS "reasonCode",
      terminal.attempt_ordinal::TEXT AS "attemptOrdinal",
      terminal.model_job_identity AS "modelJobIdentity",
      terminal.source_authority_sha256 AS "sourceAuthoritySha256"
    FROM public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
      $1::UUID, $2::UUID
    ) AS terminal
    WHERE terminal.requested_utc_date = ANY($3::DATE[])
    ORDER BY terminal.requested_utc_date
  `, [
    readerSummaryDailyTerminalSetReceiptTenantId,
    readerSummaryDailyTerminalSetReceiptWorkspaceId,
    invalidProductRetryDates,
  ]);
  return result.rows;
};

export const buildReaderSummaryDailyTerminalSetReceipt = (
  rows: readonly ReaderSummaryDailyTerminalSetRow[],
): ReaderSummaryDailyTerminalSetReceipt => {
  if (rows.length !== invalidProductRetryDates.length) {
    throw new Error("Daily terminal-set receipt requires exactly six terminals");
  }
  const entries = rows.map((row, index) => {
    const expectedDate = invalidProductRetryDates[index];
    if (
      row.requestedUtcDate !== expectedDate ||
      row.outcome !== "UNAVAILABLE" ||
      row.reasonCode !== "invalid_product" ||
      row.attemptOrdinal !== "2" ||
      !/^[0-9a-f]{64}$/u.test(row.modelJobIdentity) ||
      !/^[0-9a-f]{64}$/u.test(row.sourceAuthoritySha256)
    ) {
      throw new Error("Daily terminal-set receipt terminal authority is invalid");
    }
    return Object.freeze({
      requestedUtcDate: expectedDate as InvalidProductRetryDate,
      modelJobIdentity: row.modelJobIdentity,
      sourceAuthoritySha256: row.sourceAuthoritySha256,
    });
  });
  return Object.freeze({
    schemaVersion: readerSummaryDailyTerminalSetReceiptSchemaVersion,
    retrySetToken: invalidProductRetrySetToken,
    tenantId: readerSummaryDailyTerminalSetReceiptTenantId,
    workspaceId: readerSummaryDailyTerminalSetReceiptWorkspaceId,
    requestedUtcDates: invalidProductRetryDates,
    terminalCount: 6,
    terminalSetSha256: canonicalInvalidProductRetrySetSha256(entries),
  });
};

export const parseReaderSummaryDailyTerminalSetReceiptLine = (
  line: string,
): ReaderSummaryDailyTerminalSetReceipt => {
  if (!line.endsWith("\n") || line.slice(0, -1).includes("\n") ||
      line.includes("\r")) {
    throw new Error("Daily terminal-set receipt must be exactly one JSON line");
  }
  let value: unknown;
  try {
    value = JSON.parse(line.slice(0, -1));
  } catch {
    throw new Error("Daily terminal-set receipt JSON is invalid");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Daily terminal-set receipt shape is invalid");
  }
  const receipt = value as Record<string, unknown>;
  if (JSON.stringify(receipt) + "\n" !== line ||
      JSON.stringify(Object.keys(receipt)) !==
        JSON.stringify(readerSummaryDailyTerminalSetReceiptKeys)) {
    throw new Error("Daily terminal-set receipt keys or encoding are invalid");
  }
  if (receipt.schemaVersion !== readerSummaryDailyTerminalSetReceiptSchemaVersion ||
      receipt.retrySetToken !== invalidProductRetrySetToken ||
      receipt.tenantId !== readerSummaryDailyTerminalSetReceiptTenantId ||
      receipt.workspaceId !== readerSummaryDailyTerminalSetReceiptWorkspaceId ||
      JSON.stringify(receipt.requestedUtcDates) !== JSON.stringify(invalidProductRetryDates) ||
      receipt.terminalCount !== invalidProductRetryDates.length ||
      typeof receipt.terminalSetSha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(receipt.terminalSetSha256)) {
    throw new Error("Daily terminal-set receipt values are invalid");
  }
  return Object.freeze(receipt) as ReaderSummaryDailyTerminalSetReceipt;
};
