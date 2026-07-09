import type { Pool } from "pg";

import {
  readDashboardCollectionDates,
  readDashboardFeedItems,
} from "./reader-summary-quality-dashboard-published-window";

describe("reader summary quality dashboard published window", () => {
  it("uses an explicit date without reading observed collection days", async () => {
    const pool = fakePool();

    await expect(
      readDashboardCollectionDates(pool, "2026-07-07"),
    ).resolves.toEqual(["2026-07-07"]);
    expect(pool.queries).toHaveLength(0);
  });

  it("reads visible feed items by published window", async () => {
    const pool = fakePool();

    await readDashboardFeedItems(
      pool,
      {
        tenantId: "00000000-0000-7000-8000-000000000901",
        workspaceId: "00000000-0000-7000-8000-000000000902",
      },
      "2026-07-07",
    );

    expect(pool.queries[0]?.sql).toContain("status = 'VISIBLE'");
    expect(pool.queries[0]?.sql).toContain("published_at >= $3::timestamptz");
    expect(pool.queries[0]?.sql).toContain("published_at < $4::timestamptz");
    expect(pool.queries[0]?.sql).not.toContain(
      "observed_at >= $3::timestamptz",
    );
    expect(pool.queries[0]?.values).toEqual([
      "00000000-0000-7000-8000-000000000901",
      "00000000-0000-7000-8000-000000000902",
      "2026-07-07T00:00:00.000Z",
      "2026-07-08T00:00:00.000Z",
    ]);
  });
});

function fakePool(): Pool & {
  readonly queries: { readonly sql: string; readonly values: unknown[] }[];
} {
  const queries: { readonly sql: string; readonly values: unknown[] }[] = [];

  return {
    queries,
    query: async (sql: string, values: unknown[] = []) => {
      queries.push({ sql, values });
      return { rows: [] };
    },
  } as unknown as Pool & {
    readonly queries: { readonly sql: string; readonly values: unknown[] }[];
  };
}
