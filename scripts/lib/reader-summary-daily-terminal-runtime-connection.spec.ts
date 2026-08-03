import type { PoolClient } from "pg";

import { createReaderSummaryDailyTerminalRuntimeConnection } from "./reader-summary-daily-terminal-runtime-connection";

describe("createReaderSummaryDailyTerminalRuntimeConnection", () => {
  it("creates role-separated pools with max exactly one", async () => {
    const created: Record<string, unknown>[] = [];
    const queries: string[] = [];
    const connection = createReaderSummaryDailyTerminalRuntimeConnection(testEnv(), (config) => {
      created.push(config);
      return pool(queries);
    });
    await connection.terminal.serializable(async (transaction) => {
      await transaction.query("SELECT 1");
    });
    expect(created).toHaveLength(2);
    expect(created.every((config) => config.max === 1)).toBe(true);
    expect(queries).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      "SELECT 1",
      "COMMIT",
    ]);
    await connection.close();
  });

  it("rolls back a failed transaction", async () => {
    const queries: string[] = [];
    const connection = createReaderSummaryDailyTerminalRuntimeConnection(testEnv(), () => pool(queries));
    await expect(connection.terminal.serializable(async () => {
      throw new Error("failed");
    })).rejects.toThrow("failed");
    expect(queries).toEqual(["BEGIN ISOLATION LEVEL SERIALIZABLE", "ROLLBACK"]);
  });

  it.each([
    ["missing terminal", { ...testEnv(), READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL: undefined }],
    ["wrong terminal role", { ...testEnv(), READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL: "postgresql://ordinary:password@db.test/social" }],
    ["same role", { ...testEnv(), READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL: "postgresql://social_monitor_reader_summary_daily_terminal:raw-password@db.test/social" }],
  ])("fails closed for %s", (_label, value) => {
    expect(() => createReaderSummaryDailyTerminalRuntimeConnection(value, () => pool([]))).toThrow();
  });
});

function testEnv() {
  return {
  READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL:
    "postgresql://social_monitor_reader_summary_daily_terminal:password@db.test/social",
  READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL:
    "postgresql://social_monitor_reader_summary_daily_auditor:raw-password@db.test/social",
  };
}
const pool = (queries: string[]) => ({
  connect: async () => ({
    query: async (text: string) => {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
    release: jest.fn(),
  } as unknown as PoolClient),
  end: async () => undefined,
});
