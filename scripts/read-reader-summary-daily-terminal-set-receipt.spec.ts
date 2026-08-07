import { Pool } from "pg";

import { invalidProductRetryDates } from "./lib/reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";
import type { ReaderSummaryDailyTerminalSetRow } from "./lib/reader-summary-daily-terminal-set-receipt";
import { main, terminalDatabaseUrl } from "./read-reader-summary-daily-terminal-set-receipt";

jest.mock("pg", () => ({ Pool: jest.fn() }));

const terminals = (): readonly ReaderSummaryDailyTerminalSetRow[] =>
  invalidProductRetryDates.map((requestedUtcDate, index) => ({
    requestedUtcDate,
    outcome: "UNAVAILABLE",
    reasonCode: "invalid_product",
    attemptOrdinal: "2",
    modelJobIdentity: (index + 1).toString(16).repeat(64),
    sourceAuthoritySha256: (index + 7).toString(16).repeat(64),
  }));

describe("read reader-summary daily terminal-set receipt CLI", () => {
  const originalArgv = process.argv;
  const originalSystemDatabaseUrl = process.env.SYSTEM_DATABASE_URL;

  beforeEach(() => {
    process.argv = [originalArgv[0]!, originalArgv[1]!];
    process.env.SYSTEM_DATABASE_URL =
      "postgresql://social_monitor_system_app:password@db.test:5432/social?sslmode=require";
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalSystemDatabaseUrl === undefined) delete process.env.SYSTEM_DATABASE_URL;
    else process.env.SYSTEM_DATABASE_URL = originalSystemDatabaseUrl;
    jest.restoreAllMocks();
  });

  it("prints one line after a SERIALIZABLE terminal-principal transaction", async () => {
    const query = jest.fn(async (sql: string) =>
      sql.includes("read_reader_summary_daily_canonical_recovery_v4_terminals")
        ? { rows: terminals() } : { rows: [] });
    const release = jest.fn();
    const end = jest.fn(async () => undefined);
    jest.mocked(Pool).mockImplementation(() => ({
      connect: jest.fn(async () => ({ query, release })), end,
    }) as never);
    const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    await main();

    expect(jest.mocked(Pool)).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: expect.stringContaining(
        "social_monitor_reader_summary_daily_terminal:password@db.test:5432",
      ),
      max: 1,
    }));
    expect(query.mock.calls[0]?.[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(query.mock.calls.map(([sql]) => sql)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/\b(INSERT|UPDATE|DELETE|CALL)\b/u),
    ]));
    expect(release).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toMatch(/^\{[^\n]+\}\n$/u);
  });

  it("rolls back and emits no receipt when terminal validation fails", async () => {
    const query = jest.fn(async (sql: string) =>
      sql.includes("read_reader_summary_daily_canonical_recovery_v4_terminals")
        ? { rows: terminals().slice(1) } : { rows: [] });
    const release = jest.fn();
    jest.mocked(Pool).mockImplementation(() => ({
      connect: jest.fn(async () => ({ query, release })),
      end: jest.fn(async () => undefined),
    }) as never);
    const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(main()).rejects.toThrow(/exactly six terminals/u);

    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(write).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("derives only from the exact system login and preserves connection fields", () => {
    expect(terminalDatabaseUrl(
      "postgresql://social_monitor_system_app:password@db.test:5433/social%2Fmonitor?sslmode=verify-full",
    )).toBe(
      "postgresql://social_monitor_reader_summary_daily_terminal:password@db.test:5433/social%2Fmonitor?sslmode=verify-full",
    );
    expect(() => terminalDatabaseUrl(
      "postgresql://social_monitor_app:password@db.test/social",
    )).toThrow(/production system login/u);
  });
});
