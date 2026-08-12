import { Pool } from "pg";

import {
  readProductionDayScope,
  readerSummaryProductionDayScope,
} from "./reader-summary-production-day-scope";

jest.mock("pg", () => ({
  Pool: jest.fn(),
}));

const connectionString = "postgresql://summary-reader.invalid/social_monitor";
const collectionDate = "2026-07-28";
const periodStartedAt = "2026-07-28T00:00:00.000Z";
const periodEndedAt = "2026-07-29T00:00:00.000Z";
const systemAccessQuery =
  "SELECT set_config('social_monitor.system_access', 'true', false)";

describe("readProductionDayScope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sets system access before reading only the canonical production feed scope", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            itemCount: "4",
          },
        ],
      });
    const pool = installPool(query);

    await expect(readScope()).resolves.toEqual(readerSummaryProductionDayScope);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(systemAccessQuery);
    expect(query.mock.calls[1]?.[0]).toContain("from feed_items");
    expect(query.mock.calls[1]?.[0]).toContain("tenant_id = $3::uuid");
    expect(query.mock.calls[1]?.[0]).toContain("workspace_id = $4::uuid");
    expect(query.mock.calls[1]?.[1]).toEqual([
      periodStartedAt,
      periodEndedAt,
      readerSummaryProductionDayScope.tenantId,
      readerSummaryProductionDayScope.workspaceId,
    ]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(pool.release).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("falls back only to enabled bindings in the canonical production scope", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            bindingCount: "2",
          },
        ],
      });
    const pool = installPool(query);
    const warning = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(readScope()).resolves.toEqual(readerSummaryProductionDayScope);

    expect(query.mock.calls[0]?.[0]).toBe(systemAccessQuery);
    expect(query.mock.calls[1]?.[0]).toContain("from feed_items");
    expect(query.mock.calls[2]?.[0]).toContain("from source_bindings");
    expect(query.mock.calls[2]?.[0]).toContain("deleted_at is null");
    expect(query.mock.calls[2]?.[0]).toContain("status = 'ENABLED'");
    expect(query.mock.calls[2]?.[0]).toContain("tenant_id = $1::uuid");
    expect(query.mock.calls[2]?.[0]).toContain("workspace_id = $2::uuid");
    expect(query.mock.calls[2]?.[1]).toEqual([
      readerSummaryProductionDayScope.tenantId,
      readerSummaryProductionDayScope.workspaceId,
    ]);
    expect(warning).toHaveBeenCalledWith(
      `No published feed items found for ${collectionDate}; using enabled source binding scope before live collection.`,
    );
    expect(pool.release).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });

  it("fails closed when neither discovery query finds a scope", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = installPool(query);

    await expect(readScope()).rejects.toThrow(
      `No published feed items or enabled source bindings found for ${collectionDate}`,
    );

    expect(query.mock.calls[0]?.[0]).toBe(systemAccessQuery);
    expect(query.mock.calls[1]?.[0]).toContain("from feed_items");
    expect(query.mock.calls[2]?.[0]).toContain("from source_bindings");
    expect(pool.release).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("cannot select a larger legacy tenant feed population", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ itemCount: "231" }] });
    installPool(query);

    await expect(readScope()).resolves.toEqual(readerSummaryProductionDayScope);

    const scopeValues = query.mock.calls[1]?.[1] as readonly string[];
    expect(scopeValues).toContain("00000000-0000-7000-8000-000000006101");
    expect(scopeValues).toContain("00000000-0000-7000-8000-000000006102");
    expect(scopeValues).not.toContain("00000000-0000-7000-8000-000000000901");
    expect(scopeValues).not.toContain("00000000-0000-7000-8000-000000000902");
  });
});

function readScope() {
  return readProductionDayScope({
    connectionString,
    periodStartedAt,
    periodEndedAt,
    collectionDate,
  });
}

function installPool(query: jest.Mock) {
  const release = jest.fn();
  const connect = jest.fn().mockResolvedValue({ query, release });
  const end = jest.fn().mockResolvedValue(undefined);
  jest
    .mocked(Pool)
    .mockImplementation(() => ({ connect, end }) as unknown as Pool);
  return { connect, end, release };
}
