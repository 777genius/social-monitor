import { assertExactUtcDate } from "./reader-summary-daily-maintenance-bounds";
import {
  assertReaderSummaryDailyMaintenanceScope,
  type ReaderSummaryDailyMaintenanceScope,
} from "./reader-summary-daily-maintenance-scope";

export type ReaderSummaryDailyMaintenanceCursorPreviewReader = Readonly<{
  query<TRow extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

export const readReaderSummaryDailyMaintenanceCursorPreview = async (params: {
  readonly reader: ReaderSummaryDailyMaintenanceCursorPreviewReader;
  readonly scope: ReaderSummaryDailyMaintenanceScope;
  readonly firstUnresolvedUtcDate: string;
}): Promise<Readonly<{ nextUnresolvedUtcDate: string }>> => {
  assertReaderSummaryDailyMaintenanceScope(params.scope);
  assertExactUtcDate(
    params.firstUnresolvedUtcDate,
    "maintenance first unresolved date",
  );
  const result = await params.reader.query<{
    readonly nextUnresolvedUtcDate: string;
  }>(
    `SELECT next_unresolved_utc_date::TEXT AS "nextUnresolvedUtcDate"
     FROM reader_summary_daily_execution_cursors
     WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID`,
    [params.scope.tenantId, params.scope.workspaceId],
  );
  if (result.rows.length === 0) {
    return { nextUnresolvedUtcDate: params.firstUnresolvedUtcDate };
  }
  if (result.rows.length !== 1) {
    throw new Error("Daily maintenance cursor preview did not return exactly one row");
  }
  const nextUnresolvedUtcDate = result.rows[0]?.nextUnresolvedUtcDate;
  if (typeof nextUnresolvedUtcDate !== "string") {
    throw new Error("Daily maintenance cursor preview date is missing");
  }
  assertExactUtcDate(nextUnresolvedUtcDate, "maintenance cursor date");
  return { nextUnresolvedUtcDate };
};
