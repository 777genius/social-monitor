import { readerSummaryWeeklyScopeKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import type {
  ReaderSummaryWeeklyProductionPostgresClient,
  ReaderSummaryWeeklyProductionScope,
  ReaderSummaryWeeklyProductionWindow,
} from "./reader-summary-weekly-production-postgres-contract";

export const readerSummaryWeeklyDailyCertificationBackfillDates =
  Object.freeze([
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
    "2026-07-23",
    "2026-07-24",
    "2026-07-25",
    "2026-07-26",
  ] as const);

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
  assertSupportedWindow(window);
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
    rows.length !== readerSummaryWeeklyDailyCertificationBackfillDates.length ||
    rows.some(
      (row, index) =>
        row.requestedUtcDate !==
        readerSummaryWeeklyDailyCertificationBackfillDates[index],
    )
  ) {
    throw new Error(
      "Reader summary weekly daily certification backfill did not return exact Monday-Sunday authority",
    );
  }
  return Object.freeze(rows);
};

const assertSupportedWindow = (
  window: ReaderSummaryWeeklyProductionWindow,
): void => {
  if (
    window.weekStartedOn !==
      readerSummaryWeeklyDailyCertificationBackfillDates[0] ||
    window.weekEndedOn !==
      readerSummaryWeeklyDailyCertificationBackfillDates[6] ||
    window.dates.length !==
      readerSummaryWeeklyDailyCertificationBackfillDates.length ||
    window.dates.some(
      (date, index) =>
        date !== readerSummaryWeeklyDailyCertificationBackfillDates[index],
    )
  ) {
    throw new Error(
      "Reader summary weekly daily certification backfill only supports 2026-07-20..2026-07-26",
    );
  }
};

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
