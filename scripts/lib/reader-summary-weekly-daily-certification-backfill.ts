import { readerSummaryWeeklyScopeKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyProductionWindow,
  previousCompletedReaderSummaryWeeklyProductionWindow,
  resolveCompletedReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionWindow,
} from "./reader-summary-weekly-production-postgres-contract";
import type {
  ReaderSummaryWeeklyProductionPostgresClient,
  ReaderSummaryWeeklyProductionScope,
} from "./reader-summary-weekly-production-postgres-contract";

export type ReaderSummaryWeeklyDailyCertificationBackfillOutcome = Readonly<{
  requestedUtcDate: string;
  publicationId: string;
  outcome: "inserted" | "replayed";
  identity: string;
  canonicalSha256: string;
}>;

type BackfillRow = Readonly<{
  requested_utc_date: string;
  publication_id: string;
  outcome: string;
  identity: string;
  canonical_sha256: string;
}>;

export const backfillReaderSummaryWeeklyDailyCertifications = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): Promise<readonly ReaderSummaryWeeklyDailyCertificationBackfillOutcome[]> => {
  assertReaderSummaryWeeklyProductionWindow(window);
  const scopeKey = readerSummaryWeeklyScopeKey(scope.scope);
  const result = await client.query<BackfillRow>(
    `
      SELECT
        to_char(requested_utc_date, 'YYYY-MM-DD') AS requested_utc_date,
        publication_id::text,
        outcome,
        identity,
        btrim(canonical_sha256) AS canonical_sha256
      FROM backfill_reader_summary_weekly_daily_certifications(
        $1::uuid,
        $2::uuid,
        $3::text,
        $4::text,
        $5::date
      )
      ORDER BY requested_utc_date
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      scope.scope.type,
      scopeKey,
      window.weekStartedOn,
    ],
  );
  const rows = result.rows.map(rowFromDb);
  if (
    rows.length !== window.dates.length ||
    rows.some(
      (row, index) =>
        row.requestedUtcDate !== window.dates[index],
    )
  ) {
    throw new Error(
      "Reader summary weekly daily certification backfill did not return exact Monday-Sunday authority",
    );
  }
  return Object.freeze(rows);
};

export const resolveReaderSummaryWeeklyDailyCertificationBackfillWindow = (
  weekStartedOn: string | undefined,
  now: Date,
): ReaderSummaryWeeklyProductionWindow =>
  weekStartedOn === undefined
    ? previousCompletedReaderSummaryWeeklyProductionWindow(now)
    : resolveCompletedReaderSummaryWeeklyProductionWindow(weekStartedOn, now);

const rowFromDb = (
  row: BackfillRow,
): ReaderSummaryWeeklyDailyCertificationBackfillOutcome => {
  if (
    row.outcome !== "inserted" &&
    row.outcome !== "replayed"
  ) {
    throw new Error(
      "Reader summary weekly daily certification backfill outcome is invalid",
    );
  }
  if (
    typeof row.publication_id !== "string" ||
    row.publication_id.length === 0 ||
    typeof row.identity !== "string" ||
    !row.identity.startsWith(
      "reader_summary.weekly_publication_evidence.v1:",
    ) ||
    !/^[0-9a-f]{64}$/u.test(row.canonical_sha256) ||
    !row.identity.endsWith(row.canonical_sha256)
  ) {
    throw new Error(
      "Reader summary weekly daily certification backfill seal is invalid",
    );
  }
  return Object.freeze({
    requestedUtcDate: row.requested_utc_date,
    publicationId: row.publication_id,
    outcome: row.outcome,
    identity: row.identity,
    canonicalSha256: row.canonical_sha256,
  });
};
