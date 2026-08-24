import { readFileSync } from "node:fs";

const migrationPath =
  "prisma/migrations/20260824120000_reader_summary_daily_model_job_telemetry/migration.sql";

describe("reader summary daily model telemetry migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("is additive, historical-safe, tenant-owned, and profile-valued", () => {
    expect(sql).toContain("@social-monitor-forward-migration");
    expect(sql).toContain("ADD COLUMN \"input_tokens\" BIGINT");
    expect(sql).toContain("DEFAULT 'UNAVAILABLE'");
    expect(sql).toContain("SET \"usage_source\" = 'HISTORICAL_INCOMPLETE'");
    expect(sql).toContain("complete_reader_summary_daily_model_job_v2");
    expect(sql).toContain("social_monitor_reader_summary_daily_publication_definer");
    expect(sql).toContain("social_monitor_reader_summary_daily_terminal");
    expect(sql).toContain("verified_attestation->>'reasoningEffort'");
    expect(sql).toContain("v_job.\"reasoning_effort\"");
    expect(sql).not.toMatch(/reasoningEffort'\s+IS DISTINCT FROM\s+'(?:xhigh|high)'/u);
  });

  it("rejects unavailable completion and binds exact replay telemetry", () => {
    expect(sql).toContain("observed_usage_source NOT IN ('PROVIDER_REPORTED', 'ESTIMATED')");
    expect(sql).toContain("v_job.\"input_tokens\" IS DISTINCT FROM observed_input_tokens");
    expect(sql).toContain("v_job.\"duration_ms\" IS DISTINCT FROM observed_duration_ms");
    expect(sql).toContain("v_receipt->'executionUsage'->>'usageSource'");
    expect(sql).toContain("daily COMPLETED telemetry replay diverged");
  });
});
