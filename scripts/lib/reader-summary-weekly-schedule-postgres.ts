import {
  deriveReaderSummaryWeeklyScheduleSlot,
  type ReaderSummaryWeeklySlotObservation,
  type ReaderSummaryWeeklySlotState,
} from "../../libs/summary/domain/policies/reader-summary-weekly-schedule-policy";
import { readerSummaryWeeklyScopeKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";

import type {
  ReaderSummaryWeeklyProductionPostgresClient,
  ReaderSummaryWeeklyProductionScope,
} from "./reader-summary-weekly-production-postgres-contract";

type ScheduleRow = Readonly<{
  source: "publication" | "receipt";
  week_started_on: string;
  week_ended_on: string;
  state: string;
  identity: string;
}>;

export const loadReaderSummaryWeeklyScheduleObservations = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  scope: ReaderSummaryWeeklyProductionScope,
  firstWeekStartedOn: string,
  now: Date,
): Promise<readonly ReaderSummaryWeeklySlotObservation[]> => {
  const currentWeekStartedOn = mondayUtcDate(now);
  const firstWeekBoundary = utcBoundary(firstWeekStartedOn);
  const currentWeekBoundary = utcBoundary(currentWeekStartedOn);
  const scopeKey = readerSummaryWeeklyScopeKey(scope.scope);
  const result = await client.query<ScheduleRow>(
    `
      SELECT 'publication'::text AS source,
        to_char(publication.period_started_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD') AS week_started_on,
        to_char(publication.period_ended_at AT TIME ZONE 'UTC' - interval '1 day',
          'YYYY-MM-DD') AS week_ended_on,
        'completed'::text AS state, publication.id::text AS identity
      FROM reader_summary_publications AS publication
      WHERE publication.tenant_id = $1::uuid
        AND publication.workspace_id = $2::uuid
        AND publication.scope_type = $3
        AND publication.scope_key = $4
        AND publication.cadence = 'weekly'
        AND publication.publication_kind = 'WEEKLY_CERTIFIED'
        AND publication.period_started_at >= $5::timestamptz
        AND publication.period_started_at < $6::timestamptz
      UNION ALL
      SELECT 'receipt'::text AS source,
        to_char(job.period_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
        to_char(job.period_ended_at AT TIME ZONE 'UTC' - interval '1 day',
          'YYYY-MM-DD'),
        CASE job.status::text
          WHEN 'RUNNING' THEN 'active'
          WHEN 'COMPLETED' THEN 'completed'
          WHEN 'FAILED' THEN CASE
            WHEN job.failure_reason LIKE
              'reader_summary.weekly_execution_receipt_fence.v1:%'
              AND position('"phase":"retryable_failure"' IN job.failure_reason) > 0
              THEN 'retryable'
            ELSE 'terminal'
          END
          ELSE 'invalid'
        END,
        job.idempotency_key
      FROM reader_summary_jobs AS job
      WHERE job.tenant_id = $1::uuid
        AND job.workspace_id = $2::uuid
        AND job.scope_type = $3
        AND job.scope_key = $4
        AND job.cadence = 'weekly'
        AND job.period_started_at >= $5::timestamptz
        AND job.period_started_at < $6::timestamptz
        AND job.status IN ('RUNNING', 'COMPLETED', 'FAILED')
        AND left(job.idempotency_key, 43) =
          'reader_summary.weekly_execution_receipt.v1:'
      ORDER BY week_started_on ASC, source ASC, identity ASC
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      scope.scope.type,
      scopeKey,
      firstWeekBoundary,
      currentWeekBoundary,
    ],
  );
  const byWeek = new Map<string, ScheduleRow[]>();
  for (const row of result.rows) {
    if (
      row.state !== "completed" &&
      row.state !== "active" &&
      row.state !== "terminal" &&
      row.state !== "retryable"
    ) {
      throw new Error("Reader summary weekly schedule DB state is invalid");
    }
    const rows = byWeek.get(row.week_started_on) ?? [];
    rows.push(row);
    byWeek.set(row.week_started_on, rows);
  }
  return Object.freeze([...byWeek.entries()].flatMap(([weekStartedOn, rows]) => {
    const publications = rows.filter((row) => row.source === "publication");
    const receipts = rows.filter((row) => row.source === "receipt");
    if (publications.length > 1 || receipts.length > 1) {
      throw new Error("Reader summary weekly schedule DB state is ambiguous");
    }
    const first = rows[0];
    if (
      first === undefined ||
      rows.some((row) => row.week_ended_on !== first.week_ended_on)
    ) {
      throw new Error("Reader summary weekly schedule DB window diverged");
    }
    const receipt = receipts[0];
    if (publications.length === 0 && receipt === undefined) {
      throw new Error("Reader summary weekly schedule DB state is ambiguous");
    }
    if (publications.length === 0 && receipt?.state === "retryable") {
      return [];
    }
    if (receipt?.state === "active") {
      // RUNNING receipts are never consumed: a recovery-only execution can
      // reclaim the exact pair, reconcile a publication, or fence it closed.
      return [];
    }
    const state: ReaderSummaryWeeklySlotState = publications.length === 1
      ? "completed"
      : receipt!.state as ReaderSummaryWeeklySlotState;
    return [Object.freeze({
      slot: deriveReaderSummaryWeeklyScheduleSlot({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        weekStartedUtcDate: weekStartedOn,
        weekEndedUtcDate: first.week_ended_on,
      }),
      state,
    })];
  }));
};

const mondayUtcDate = (now: Date): string => {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Reader summary weekly schedule now is invalid");
  }
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day - ((now.getUTCDay() + 6) % 7) * 86_400_000)
    .toISOString()
    .slice(0, 10);
};

const utcBoundary = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error("Reader summary weekly schedule UTC boundary is invalid");
  }
  const boundary = `${value}T00:00:00.000Z`;
  if (new Date(boundary).toISOString() !== boundary) {
    throw new Error("Reader summary weekly schedule UTC boundary is invalid");
  }
  return boundary;
};
