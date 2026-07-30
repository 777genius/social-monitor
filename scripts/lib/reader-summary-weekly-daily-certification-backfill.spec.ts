import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  backfillReaderSummaryWeeklyDailyCertifications,
  resolveReaderSummaryWeeklyDailyCertificationBackfillWindow,
} from "./reader-summary-weekly-daily-certification-backfill";
import { parseReaderSummaryWeeklyDailyCertificationBackfillArgs } from "./reader-summary-weekly-daily-certification-backfill-cli";
import {
  resolveReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionPostgresClient,
} from "./reader-summary-weekly-production-postgres-contract";

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const scope = Object.freeze({
  tenantId,
  workspaceId,
  scope: Object.freeze({ type: "workspace" as const }),
});
const window = resolveReaderSummaryWeeklyProductionWindow("2026-07-20");
const sha = "a".repeat(64);

describe("reader summary weekly daily certification backfill", () => {
  it("requests and accepts the exact Monday-Sunday database backfill", async () => {
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const client = fakeClient(rows(), queries);

    const result = await backfillReaderSummaryWeeklyDailyCertifications(
      client,
      scope,
      window,
    );

    expect(result).toHaveLength(7);
    expect(result.map((row) => row.requestedUtcDate)).toEqual(window.dates);
    expect(queries[0]?.sql).toContain(
      "backfill_reader_summary_weekly_daily_certifications",
    );
    expect(queries[0]?.values).toEqual([
      tenantId,
      workspaceId,
      "workspace",
      "workspace",
      "2026-07-20",
    ]);
  });

  it("accepts idempotent replay outcomes", async () => {
    const result = await backfillReaderSummaryWeeklyDailyCertifications(
      fakeClient(rows(window, "replayed")),
      scope,
      window,
    );

    expect(result.every((row) => row.outcome === "replayed")).toBe(true);
  });

  it("passes an exact interest scope key", async () => {
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    await backfillReaderSummaryWeeklyDailyCertifications(
      fakeClient(rows(), queries),
      {
        tenantId,
        workspaceId,
        scope: {
          type: "interest",
          interestId: "33333333-3333-4333-8333-333333333333",
        },
      },
      window,
    );

    expect(queries[0]?.values?.slice(2, 4)).toEqual([
      "interest",
      "interest:33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("fails closed when a day is missing or reordered", async () => {
    await expect(
      backfillReaderSummaryWeeklyDailyCertifications(
        fakeClient(rows().slice(0, 6)),
        scope,
        window,
      ),
    ).rejects.toThrow("did not return exact Monday-Sunday authority");

    const reordered = [...rows()];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    await expect(
      backfillReaderSummaryWeeklyDailyCertifications(
        fakeClient(reordered),
        scope,
        window,
      ),
    ).rejects.toThrow("did not return exact Monday-Sunday authority");
  });

  it("rejects an internally partial or divergent window before querying", async () => {
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    await expect(
      backfillReaderSummaryWeeklyDailyCertifications(
        fakeClient(rows().slice(0, 6), queries),
        scope,
        { ...window, dates: window.dates.slice(0, 6) },
      ),
    ).rejects.toThrow("must be exact Monday-Sunday UTC");
    expect(queries).toEqual([]);
  });

  it("fails closed on an unknown outcome or divergent seal", async () => {
    const unknown = [...rows()];
    unknown[0] = { ...unknown[0]!, outcome: "updated" };
    await expect(
      backfillReaderSummaryWeeklyDailyCertifications(
        fakeClient(unknown),
        scope,
        window,
      ),
    ).rejects.toThrow("backfill outcome is invalid");

    const divergent = [...rows()];
    divergent[0] = { ...divergent[0]!, canonical_sha256: "b".repeat(64) };
    await expect(
      backfillReaderSummaryWeeklyDailyCertifications(
        fakeClient(divergent),
        scope,
        window,
      ),
    ).rejects.toThrow("backfill seal is invalid");
  });

  it("supports an arbitrary completed future Monday-Sunday week", async () => {
    const futureWindow =
      resolveReaderSummaryWeeklyDailyCertificationBackfillWindow(
        "2027-02-01",
        new Date("2027-02-08T06:00:00.000Z"),
      );
    const result = await backfillReaderSummaryWeeklyDailyCertifications(
      fakeClient(rows(futureWindow)),
      scope,
      futureWindow,
    );

    expect(result.map((row) => row.requestedUtcDate)).toEqual(
      futureWindow.dates,
    );
  });

  it("defaults to the same previous completed week as the generation runner", () => {
    const now = new Date("2027-02-10T18:30:00.000Z");

    expect(
      resolveReaderSummaryWeeklyDailyCertificationBackfillWindow(
        undefined,
        now,
      ),
    ).toEqual(resolveReaderSummaryWeeklyProductionWindow("2027-02-01"));
  });

  it("rejects current, non-Monday, malformed, and ambiguous CLI windows", () => {
    expect(() =>
      resolveReaderSummaryWeeklyDailyCertificationBackfillWindow(
        "2027-02-08",
        new Date("2027-02-10T18:30:00.000Z"),
      ),
    ).toThrow("window must be completed");
    expect(() =>
      resolveReaderSummaryWeeklyDailyCertificationBackfillWindow(
        "2027-02-02",
        new Date("2027-02-10T18:30:00.000Z"),
      ),
    ).toThrow("must start Monday");
    expect(() =>
      parseReaderSummaryWeeklyDailyCertificationBackfillArgs([
        "--week-start",
      ]),
    ).toThrow("Missing value");
    expect(() =>
      parseReaderSummaryWeeklyDailyCertificationBackfillArgs([
        "--week-start",
        "2027-02-01",
        "--week-start",
        "2027-02-08",
      ]),
    ).toThrow("only once");
    expect(() =>
      parseReaderSummaryWeeklyDailyCertificationBackfillArgs(["--replay"]),
    ).toThrow("Unknown");
  });

  it("keeps the forward migration ordered, append-only, and delegated to the recorder", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260730010000_reader_summary_weekly_window_generalization/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(migration).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
    expect(migration).toContain(
      "current_setting('transaction_isolation') <> 'serializable'",
    );
    expect(migration).toContain(
      "weekly daily certification backfill session scope diverged",
    );
    expect(migration).toContain(
      ") IS DISTINCT FROM target_tenant_id::TEXT",
    );
    expect(migration).toContain(
      ") IS DISTINCT FROM target_workspace_id::TEXT",
    );
    expect(migration).toContain(
      "'social_monitor_reader_summary_publication_runtime'",
    );
    expect(migration).toContain("ORDER BY slot.\"period_started_at\"");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).not.toMatch(/\bLOCK\s+TABLE\b/u);
    expect(migration).toContain("jsonb_object_length(provider.value) <> 13");
    expect(migration).toContain(
      "length(provider.value->>'sourceText') > 16384",
    );
    expect(migration).toContain("DATE '2026-07-23'");
    expect(migration).not.toContain("DATE '2026-07-20'");
    expect(migration).not.toContain("DATE '2026-07-26'");
    expect(migration).toContain(
      'PERFORM "record_reader_summary_weekly_publication_evidence"',
    );
    expect(migration).not.toContain(
      'INSERT INTO "reader_summary_weekly_publication_evidence"',
    );
    expect(migration).not.toContain(
      'UPDATE "reader_summary_weekly_publication_evidence"',
    );
    expect(migration).not.toContain(
      'DELETE FROM "reader_summary_weekly_publication_evidence"',
    );
  });
});

type Row = ReturnType<typeof row>;

function rows(
  targetWindow = window,
  outcome: "inserted" | "replayed" = "inserted",
): Row[] {
  return targetWindow.dates.map((date) => row(date, outcome));
}

function row(date: string, outcome: string) {
  return {
    requested_utc_date: date,
    publication_id: `publication:${date}`,
    outcome,
    identity: `reader_summary.weekly_publication_evidence.v1:${sha}`,
    canonical_sha256: sha,
  };
}

function fakeClient(
  resultRows: readonly Row[],
  queries: { sql: string; values?: readonly unknown[] }[] = [],
): ReaderSummaryWeeklyProductionPostgresClient {
  return {
    async query<TRow extends Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ) {
      queries.push({ sql, ...(values === undefined ? {} : { values }) });
      return { rows: resultRows as unknown as readonly TRow[] };
    },
  };
}
