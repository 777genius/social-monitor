import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration =
  "prisma/migrations/20260813090000_reader_summary_daily_live_canonical_bounds/migration.sql";

describe("daily live canonical bounds migration", () => {
  const sql = readFileSync(resolve(migration), "utf8");

  it("admits only strict one-day daily reports without changing weekly bounds", () => {
    expect(sql).toContain('public.jsonb_object_length(value) <> 9');
    expect(sql).toContain("'reader_summary.publication_report.v1'");
    expect(sql).toContain("'reader_summary.artifact.v1'");
    expect(sql).toContain("v_period->>'cadence' IS DISTINCT FROM 'daily'");
    expect(sql).toContain("v_period->>'timezone' IS DISTINCT FROM 'UTC'");
    expect(sql).toContain("'daily:' || v_period->>'startedAt'");
    expect(sql).toContain("IS DISTINCT FROM INTERVAL '1 day'");
    expect(sql).toContain('RETURN public."reader_summary_weekly_canonical_json"(value)');
    expect(sql).toContain("v_nodes > 25000");
    expect(sql).toContain("v_object_keys > 20000");
    expect(sql).toContain("v_bytes > 4194304");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.reader_summary_weekly_canonical_json");
  });

  it("rewrites ordinary daily evidence report and artifact hashes", () => {
    expect(sql).toContain(
      'CREATE FUNCTION public."reader_summary_daily_artifact_canonical_json"',
    );
    expect(sql).toContain(
      "'public.record_reader_summary_weekly_publication_evidence_base(uuid)'::REGPROCEDURE",
    );
    expect(sql).toContain("daily live evidence canonicalizer targets diverged");
    expect(sql).toContain(
      '"reader_summary_daily_canonical_recovery_v4_report_canonical_json"(v_report)',
    );
    expect(sql).toContain(
      '"reader_summary_daily_artifact_canonical_json"(v_artifact."artifact_payload")',
    );
    expect(sql).toContain("value->>'schemaVersion' IS DISTINCT FROM 'reader_summary.artifact.v1'");
  });

  it("keeps recovery output, receipts and attestations outside this live fix", () => {
    expect(sql).not.toContain("v_response");
    expect(sql).not.toContain("v_receipt");
    expect(sql).not.toContain("v_attestation");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
  });
});
