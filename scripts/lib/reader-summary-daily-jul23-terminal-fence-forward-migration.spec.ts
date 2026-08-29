import { readFileSync } from "node:fs";

const migrationPath =
  "prisma/migrations/20260829090000_reader_summary_daily_v4_jul23_retry_fence_correction/migration.sql";

describe("daily canonical recovery V4 Jul23 terminal fence correction", () => {
  it("is an exact, idempotent one-row forward repair", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("-- @social-monitor-forward-migration");
    expect(sql).toContain("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    expect(sql).toContain(
      'SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"',
    );
    expect(sql).toContain("DATE '2026-07-23'");
    expect(sql).toContain(
      "241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a",
    );
    expect(sql).toContain(
      "010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb",
    );
    expect(sql).toContain('v_retry."fencing_token" NOT IN (-1, 1)');
    expect(sql).toContain('v_lease."fencing_token" IS DISTINCT FROM 1');
    expect(sql).toContain('SET "fencing_token" = -retry."fencing_token"');
    expect(sql).toContain('AND retry."fencing_token" = 1');
    expect(sql).toContain("GET DIAGNOSTICS v_updated = ROW_COUNT");
    expect(sql).toContain("IF v_updated <> 1 THEN");
    expect(sql).toContain(") IS DISTINCT FROM -1 THEN");
    expect(sql).toContain(
      "reader_summary_daily_canonical_recovery_v4_terminals_from_projection",
    );
    expect(sql).toContain("IF v_terminal_count <> 8 THEN");
    expect(sql).toContain(
      "daily canonical recovery v4 Jul23 retry fence preimage diverged",
    );
    expect(sql).not.toMatch(/UPDATE[\s\S]*requested_utc_date"\s+IN\s*\(/u);
  });
});
