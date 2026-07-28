import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  backfillReaderSummaryWeeklyDailyCertifications,
  readerSummaryWeeklyDailyCertificationBackfillDates,
} from "./reader-summary-weekly-daily-certification-backfill";
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
    expect(result.map((row) => row.requestedUtcDate)).toEqual(
      readerSummaryWeeklyDailyCertificationBackfillDates,
    );
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
      fakeClient(rows("replayed")),
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

  it("rejects every window outside the owned production week", async () => {
    await expect(
      backfillReaderSummaryWeeklyDailyCertifications(
        fakeClient(rows()),
        scope,
        resolveReaderSummaryWeeklyProductionWindow("2026-07-13"),
      ),
    ).rejects.toThrow("only supports 2026-07-20..2026-07-26");
  });

  it("keeps the migration fixed-path, append-only, and delegated to the recorder", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260728180500_reader_summary_weekly_daily_certification_backfill/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(migration).toContain("DATE '2026-07-20'");
    expect(migration).toContain("DATE '2026-07-26'");
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

function rows(outcome: "inserted" | "replayed" = "inserted"): Row[] {
  return readerSummaryWeeklyDailyCertificationBackfillDates.map((date) =>
    row(date, outcome),
  );
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
    async query(sql, values) {
      queries.push({ sql, ...(values === undefined ? {} : { values }) });
      return { rows: resultRows };
    },
  };
}
