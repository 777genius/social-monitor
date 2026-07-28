import { Pool } from "pg";

import { readProductionDayScope } from "./reader-summary-production-day-scope";

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

  it("sets system access on one client before preferring the dominant feed scope", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            tenantId: "tenant-from-feed",
            workspaceId: "workspace-from-feed",
            itemCount: "4",
          },
        ],
      });
    const pool = installPool(query);

    await expect(readScope()).resolves.toEqual({
      tenantId: "tenant-from-feed",
      workspaceId: "workspace-from-feed",
    });

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(systemAccessQuery);
    expect(query.mock.calls[1]?.[0]).toContain("from feed_items");
    expect(query.mock.calls[1]?.[1]).toEqual([
      periodStartedAt,
      periodEndedAt,
    ]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(pool.release).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("falls back to the dominant enabled source binding scope", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            tenantId: "tenant-from-binding",
            workspaceId: "workspace-from-binding",
            bindingCount: "2",
          },
        ],
      });
    const pool = installPool(query);
    const warning = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(readScope()).resolves.toEqual({
      tenantId: "tenant-from-binding",
      workspaceId: "workspace-from-binding",
    });

    expect(query.mock.calls[0]?.[0]).toBe(systemAccessQuery);
    expect(query.mock.calls[1]?.[0]).toContain("from feed_items");
    expect(query.mock.calls[2]?.[0]).toContain("from source_bindings");
    expect(query.mock.calls[2]?.[0]).toContain("deleted_at is null");
    expect(query.mock.calls[2]?.[0]).toContain("status = 'ENABLED'");
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
  jest.mocked(Pool).mockImplementation(
    () => ({ connect, end }) as unknown as Pool,
  );
  return { connect, end, release };
}
