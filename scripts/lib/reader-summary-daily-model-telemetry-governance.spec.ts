import { readFileSync } from "node:fs";

describe("daily model telemetry governance", () => {
  it("retains the tenant-owned execution observation with the publication graph", () => {
    const contract = JSON.parse(
      readFileSync("ops/privacy/retention-contract.json", "utf8"),
    ) as { tables: readonly Record<string, unknown>[] };
    const policy = contract.tables.find(
      (entry) => entry.table === "reader_summary_daily_model_jobs",
    );
    expect(policy).toMatchObject({
      owner: "summary-owner",
      retentionDays: 365,
      legalHoldAware: true,
      exportable: false,
      purgeTrigger: "reader_summary_publication_graph_retention_completed",
    });
  });

  it("inherits the table's forced tenant RLS and grants only fenced completion", () => {
    const rls = readFileSync(
      "prisma/migrations/20260803174000_reader_summary_daily_execution_tenant_rls/migration.sql",
      "utf8",
    );
    const telemetry = readFileSync(
      "prisma/migrations/20260824120000_reader_summary_daily_model_job_telemetry/migration.sql",
      "utf8",
    );
    expect(rls).toContain('ALTER TABLE "reader_summary_daily_model_jobs"\n  FORCE ROW LEVEL SECURITY');
    expect(rls).toContain('CREATE POLICY "tenant_isolation"\n  ON "reader_summary_daily_model_jobs"');
    expect(telemetry).toContain("REVOKE ALL ON FUNCTION");
    expect(telemetry).toContain("FROM PUBLIC");
    expect(telemetry).toContain("TO social_monitor_reader_summary_daily_terminal");
    expect(telemetry).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON/iu);
  });
});
