import {
  assertReaderSummaryWeeklyProductionSlot,
  prepareReaderSummaryWeeklyProductionSlot,
} from "./reader-summary-weekly-production-slot";
import {
  resolveReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionPostgresClient,
} from "./reader-summary-weekly-production-postgres-contract";

const scope = Object.freeze({
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
  scope: Object.freeze({ type: "workspace" as const }),
});
const window = resolveReaderSummaryWeeklyProductionWindow("2026-07-27");
const sealSha256 = "a".repeat(64);
const publicationId = "30000000-0000-4000-8000-000000000003";
const exactRow = Object.freeze({
  outcome: "prepared",
  seal_id: `reader_summary.weekly_certification_seal.v1:${sealSha256}`,
  seal_sha256: sealSha256,
  week_started_on: "2026-07-27",
  week_ended_on: "2026-08-02",
  period_started_at: "2026-07-27T00:00:00.000Z",
  period_ended_at: "2026-08-03T00:00:00.000Z",
  period_timezone: "UTC",
  current_publication_id: null,
});

describe("reader summary weekly production slot", () => {
  it("prepares the exact Jul 27-Aug 2 seal and canonical slot", async () => {
    const client = queryClient([exactRow]);
    const prepared = await prepareReaderSummaryWeeklyProductionSlot(
      client,
      scope,
      window,
    );

    expect(prepared).toEqual({
      outcome: "prepared",
      sealId: exactRow.seal_id,
      sealSha256,
      weekStartedOn: "2026-07-27",
      weekEndedOn: "2026-08-02",
      periodStartedAt: "2026-07-27T00:00:00.000Z",
      periodEndedAt: "2026-08-03T00:00:00.000Z",
      periodTimezone: "UTC",
      currentPublicationId: null,
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("prepare_reader_summary_weekly_production_slot"),
      [scope.tenantId, scope.workspaceId, "workspace", "workspace", "2026-07-27"],
    );
  });

  it("verifies exact replay without invoking the preparation function", async () => {
    const replayRow = publishedReplayRow();
    const client = queryClient([replayRow]);
    const replay = await assertReaderSummaryWeeklyProductionSlot(
      client,
      scope,
      window,
    );

    expect(replay.outcome).toBe("replayed");
    const sql = String((client.query as jest.Mock).mock.calls[0]?.[0]);
    expect(sql).toContain("reader_summary_weekly_certification_seals");
    expect(sql).toContain("reader_summary_publication_slots");
    expect(sql).not.toContain("prepare_reader_summary_weekly_production_slot(");
  });

  it.each([
    ["seal hash", { seal_sha256: "b".repeat(64) }],
    ["start date", { week_started_on: "2026-07-20" }],
    ["end date", { week_ended_on: "2026-08-03" }],
    ["slot start", { period_started_at: "2026-07-27T01:00:00.000Z" }],
    ["slot end", { period_ended_at: "2026-08-02T00:00:00.000Z" }],
    ["slot timezone", { period_timezone: "Europe/Kyiv" }],
    ["publication", { publication_id: "40000000-0000-4000-8000-000000000004" }],
    ["publication seal", { publication_seal_sha256: "b".repeat(64) }],
    ["publication dates", { publication_week_ended_on: "2026-08-01" }],
    ["publication scope", { publication_binding_exact: false }],
  ])("fails closed on replay %s mismatch", async (_label, mismatch) => {
    const client = queryClient([{ ...publishedReplayRow(), ...mismatch }]);
    await expect(
      assertReaderSummaryWeeklyProductionSlot(client, scope, window),
    ).rejects.toThrow("seal or canonical slot diverged");
  });

  it("fails closed when the canonical seal or slot is absent", async () => {
    await expect(
      assertReaderSummaryWeeklyProductionSlot(queryClient([]), scope, window),
    ).rejects.toThrow("seal or canonical slot diverged");
  });
});

const publishedReplayRow = (): Readonly<Record<string, unknown>> => ({
  ...exactRow,
  outcome: "replayed",
  current_publication_id: publicationId,
  publication_id: publicationId,
  publication_seal_id: exactRow.seal_id,
  publication_seal_sha256: sealSha256,
  publication_week_started_on: exactRow.week_started_on,
  publication_week_ended_on: exactRow.week_ended_on,
  publication_binding_exact: true,
});

const queryClient = (
  rows: readonly Record<string, unknown>[],
): ReaderSummaryWeeklyProductionPostgresClient & Readonly<{ query: jest.Mock }> => ({
  query: jest.fn().mockResolvedValue({ rows }),
});
