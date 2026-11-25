import { loadReaderSummaryWeeklyScheduleObservations } from "./reader-summary-weekly-schedule-postgres";
import type { ReaderSummaryWeeklyProductionPostgresClient } from "./reader-summary-weekly-production-postgres-contract";

const scope = Object.freeze({
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  scope: Object.freeze({ type: "workspace" as const }),
});

describe("reader summary weekly schedule PostgreSQL state", () => {
  it("collapses an exact receipt and publication into one completed slot", async () => {
    const observations = await loadReaderSummaryWeeklyScheduleObservations(
      client([
        row("receipt", "terminal", "receipt-1"),
        row("publication", "completed", "publication-1"),
      ]),
      scope,
      "2026-07-20",
      new Date("2026-07-27T06:30:00.000Z"),
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]?.state).toBe("completed");
    expect(observations[0]?.slot.weekStartedUtcDate).toBe("2026-07-20");
  });

  it("fails closed on multiple receipts for one slot", async () => {
    await expect(loadReaderSummaryWeeklyScheduleObservations(
      client([
        row("receipt", "active", "receipt-1"),
        row("receipt", "terminal", "receipt-2"),
      ]),
      scope,
      "2026-07-20",
      new Date("2026-07-27T06:30:00.000Z"),
    )).rejects.toThrow("DB state is ambiguous");
  });

  it("leaves a retryable receipt unoccupied for its restarted scheduler attempt", async () => {
    const observations = await loadReaderSummaryWeeklyScheduleObservations(
      client([row("receipt", "retryable", "receipt-1")]),
      scope,
      "2026-07-20",
      new Date("2026-07-27T06:30:00.000Z"),
    );

    expect(observations).toEqual([]);
  });

  it("leaves a published running receipt for fenced reconciliation", async () => {
    const observations = await loadReaderSummaryWeeklyScheduleObservations(
      client([
        row("receipt", "active", "receipt-1"),
        row("publication", "completed", "publication-1"),
      ]),
      scope,
      "2026-07-20",
      new Date("2026-07-27T06:30:00.000Z"),
    );

    expect(observations).toEqual([]);
  });

  it("fails closed when a retryable receipt has a competing receipt", async () => {
    await expect(loadReaderSummaryWeeklyScheduleObservations(
      client([
        row("receipt", "retryable", "receipt-1"),
        row("receipt", "terminal", "receipt-2"),
      ]),
      scope,
      "2026-07-20",
      new Date("2026-07-27T06:30:00.000Z"),
    )).rejects.toThrow("DB state is ambiguous");
  });

  it("uses explicit UTC timestamptz bounds and leaves running receipt recovery to fencing", async () => {
    const calls: { sql: string; values: readonly unknown[] }[] = [];
    const observations = await loadReaderSummaryWeeklyScheduleObservations(
      client([row("receipt", "active", "receipt-1")], calls),
      scope,
      "2026-07-20",
      new Date("2026-07-27T06:30:00.000Z"),
    );

    expect(calls[0]?.sql).toContain("$5::timestamptz");
    expect(calls[0]?.sql).not.toContain("$5::date");
    expect(calls[0]?.sql).toContain("job.status IN ('RUNNING', 'COMPLETED', 'FAILED')");
    expect(calls[0]?.sql).toContain('"phase":"retryable_failure"');
    expect(calls[0]?.values.slice(-2)).toEqual([
      "2026-07-20T00:00:00.000Z",
      "2026-07-27T00:00:00.000Z",
    ]);
    expect(observations).toEqual([]);
  });
});

const row = (
  source: "publication" | "receipt",
  state: string,
  identity: string,
) => ({
  source,
  week_started_on: "2026-07-20",
  week_ended_on: "2026-07-26",
  state,
  identity,
});

const client = (
  rows: readonly ReturnType<typeof row>[],
  calls?: { sql: string; values: readonly unknown[] }[],
): ReaderSummaryWeeklyProductionPostgresClient => ({
  async query<TRow extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ) {
    calls?.push({ sql, values });
    return { rows: rows as unknown as readonly TRow[] };
  },
});
