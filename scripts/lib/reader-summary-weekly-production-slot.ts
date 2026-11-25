import { readerSummaryWeeklyScopeKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionPostgresClient,
  type ReaderSummaryWeeklyProductionScope,
  type ReaderSummaryWeeklyProductionWindow,
} from "./reader-summary-weekly-production-postgres-contract";

export type ReaderSummaryWeeklyProductionSlot = Readonly<{
  outcome: "prepared" | "replayed";
  sealId: string;
  sealSha256: string;
  weekStartedOn: string;
  weekEndedOn: string;
  periodStartedAt: string;
  periodEndedAt: string;
  periodTimezone: "UTC";
  currentPublicationId: string | null;
}>;

type WeeklyProductionSlotRow = Readonly<{
  outcome: string;
  seal_id: string;
  seal_sha256: string;
  week_started_on: string;
  week_ended_on: string;
  period_started_at: string;
  period_ended_at: string;
  period_timezone: string;
  current_publication_id: string | null;
  publication_id?: string | null;
  publication_seal_id?: string | null;
  publication_seal_sha256?: string | null;
  publication_week_started_on?: string | null;
  publication_week_ended_on?: string | null;
  publication_binding_exact?: boolean | null;
}>;

export const prepareReaderSummaryWeeklyProductionSlot = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): Promise<ReaderSummaryWeeklyProductionSlot> => {
  assertReaderSummaryWeeklyProductionWindow(window);
  const result = await client.query<WeeklyProductionSlotRow>(
    `
      SELECT
        outcome, seal_id, btrim(seal_sha256) AS seal_sha256,
        to_char(week_started_on, 'YYYY-MM-DD') AS week_started_on,
        to_char(week_ended_on, 'YYYY-MM-DD') AS week_ended_on,
        to_char(period_started_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_started_at,
        to_char(period_ended_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_ended_at,
        period_timezone,
        current_publication_id::text
      FROM prepare_reader_summary_weekly_production_slot(
        $1::uuid, $2::uuid, $3::text, $4::text, $5::date
      )
    `,
    scopeValues(scope, window),
  );
  return exactSlot(result.rows, window);
};

export const assertReaderSummaryWeeklyProductionSlot = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): Promise<ReaderSummaryWeeklyProductionSlot> => {
  assertReaderSummaryWeeklyProductionWindow(window);
  const scopeKey = readerSummaryWeeklyScopeKey(scope.scope);
  const result = await client.query<WeeklyProductionSlotRow>(
    `
      SELECT
        'replayed'::text AS outcome,
        seal.seal_id, btrim(seal.seal_sha256) AS seal_sha256,
        to_char(seal.week_started_on, 'YYYY-MM-DD') AS week_started_on,
        to_char(seal.week_ended_on, 'YYYY-MM-DD') AS week_ended_on,
        to_char(slot.period_started_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_started_at,
        to_char(slot.period_ended_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_ended_at,
        slot.period_timezone,
        slot.current_publication_id::text,
        publication.id::text AS publication_id,
        publication.exact_proof->>'manifestSealId' AS publication_seal_id,
        publication.exact_proof->>'manifestSealSha256'
          AS publication_seal_sha256,
        publication.exact_proof->>'weekStartedOn'
          AS publication_week_started_on,
        publication.exact_proof->>'weekEndedOn'
          AS publication_week_ended_on,
        publication.tenant_id = seal.tenant_id
          AND publication.workspace_id = seal.workspace_id
          AND publication.scope_type = seal.scope_type
          AND publication.scope_key = seal.scope_key
          AND publication.cadence = 'weekly'
          AND publication.period_started_at = slot.period_started_at
          AND publication.period_ended_at = slot.period_ended_at
          AND publication.period_timezone = slot.period_timezone
          AND publication.requested_utc_date = seal.week_started_on
          AND publication.publication_kind = 'WEEKLY_CERTIFIED'
          AND publication.semantic_status = 'COMPLETED'
          AS publication_binding_exact
      FROM reader_summary_weekly_certification_seals AS seal
      JOIN reader_summary_publication_slots AS slot
        ON slot.tenant_id = seal.tenant_id
        AND slot.workspace_id = seal.workspace_id
        AND slot.scope_type = seal.scope_type
        AND slot.scope_key = seal.scope_key
        AND slot.cadence = 'weekly'
        AND slot.period_started_at =
          seal.week_started_on::timestamp AT TIME ZONE 'UTC'
        AND slot.period_ended_at =
          (seal.week_started_on + 7)::timestamp AT TIME ZONE 'UTC'
        AND slot.period_timezone = 'UTC'
      LEFT JOIN reader_summary_publications AS publication
        ON publication.id = slot.current_publication_id
      WHERE seal.tenant_id = $1::uuid
        AND seal.workspace_id = $2::uuid
        AND seal.scope_type = $3::text
        AND seal.scope_key = $4::text
        AND seal.week_started_on = $5::date
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      scope.scope.type,
      scopeKey,
      window.weekStartedOn,
    ],
  );
  return exactSlot(result.rows, window, true);
};

const scopeValues = (
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): readonly unknown[] => [
  scope.tenantId,
  scope.workspaceId,
  scope.scope.type,
  readerSummaryWeeklyScopeKey(scope.scope),
  window.weekStartedOn,
];

const exactSlot = (
  rows: readonly WeeklyProductionSlotRow[],
  window: ReaderSummaryWeeklyProductionWindow,
  requirePublished = false,
): ReaderSummaryWeeklyProductionSlot => {
  const row = rows[0];
  const periodStartedAt = `${window.weekStartedOn}T00:00:00.000Z`;
  const periodEndedAt = new Date(
    Date.parse(`${window.weekEndedOn}T00:00:00.000Z`) + 86_400_000,
  ).toISOString();
  if (
    rows.length !== 1 ||
    row === undefined ||
    (row.outcome !== "prepared" && row.outcome !== "replayed") ||
    !/^[0-9a-f]{64}$/u.test(row.seal_sha256) ||
    row.seal_id !==
      `reader_summary.weekly_certification_seal.v1:${row.seal_sha256}` ||
    row.week_started_on !== window.weekStartedOn ||
    row.week_ended_on !== window.weekEndedOn ||
    row.period_started_at !== periodStartedAt ||
    row.period_ended_at !== periodEndedAt ||
    row.period_timezone !== "UTC" ||
    (row.current_publication_id !== null && !isUuid(row.current_publication_id)) ||
    (requirePublished && (
      row.current_publication_id === null ||
      row.publication_id !== row.current_publication_id ||
      row.publication_seal_id !== row.seal_id ||
      row.publication_seal_sha256 !== row.seal_sha256 ||
      row.publication_week_started_on !== window.weekStartedOn ||
      row.publication_week_ended_on !== window.weekEndedOn ||
      row.publication_binding_exact !== true
    ))
  ) {
    throw new Error(
      "Reader summary weekly production seal or canonical slot diverged",
    );
  }
  return Object.freeze({
    outcome: row.outcome,
    sealId: row.seal_id,
    sealSha256: row.seal_sha256,
    weekStartedOn: row.week_started_on,
    weekEndedOn: row.week_ended_on,
    periodStartedAt: row.period_started_at,
    periodEndedAt: row.period_ended_at,
    periodTimezone: "UTC",
    currentPublicationId: row.current_publication_id,
  });
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    .test(value);
