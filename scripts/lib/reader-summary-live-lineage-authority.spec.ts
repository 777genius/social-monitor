import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migration =
  "prisma/migrations/20260813093000_reader_summary_live_lineage_authority/migration.sql";
const recoveryMigration =
  "prisma/migrations/20260802233100_reader_summary_daily_canonical_recovery_v4_security/migration.sql";

describe("reader summary live lineage authority migration", () => {
  const sql = readFileSync(resolve(migration), "utf8");
  const recoverySql = readFileSync(resolve(recoveryMigration), "utf8");

  it("runs after the daily live canonical migrations", () => {
    const migrationNames = readdirSync(resolve("prisma/migrations")).sort();
    expect(migrationNames.at(-1)).toBe(
      "20260813093000_reader_summary_live_lineage_authority",
    );
  });

  it("guardedly replaces the exact deployed two-branch predicate once", () => {
    expect(sql).toContain(
      "'public.publish_reader_summary_pre_evidence(jsonb)'::REGPROCEDURE",
    );
    expect(sql).toContain("githubProjectionAudit");
    expect(sql).toContain("reader_summary.daily_canonical_recovery.v4");
    expect(sql).toContain(
      "reader summary live lineage authority rewrite target diverged",
    );
    expect(sql).toContain(
      "pg_catalog.length(v_definition) - pg_catalog.length(",
    );
    expect(sql).toContain(
      "pg_catalog.replace(v_definition, v_needle, '')",
    );
    const deployedPredicate = recoverySql.match(
      /v_lineage_replacement CONSTANT TEXT :=\n\s+'([^;]+)';/u,
    )?.[1];
    const rewriteNeedle = sql.match(
      /v_needle CONSTANT TEXT :=\n\s+'([^;]+)';/u,
    )?.[1];
    expect(rewriteNeedle).toBe(deployedPredicate);
  });

  it("requires the exact full domain lineage shape for ordinary artifacts", () => {
    const replacement = sql.slice(sql.indexOf("v_replacement CONSTANT TEXT"));
    expect(replacement).toContain(
      "jsonb_typeof(v_artifact.\"artifact_payload\"->''lineage'') IS DISTINCT FROM ''object''",
    );
    expect(replacement).toContain(
      "->''lineage''->>''modelVersion'' IS DISTINCT FROM v_artifact.\"model_version\"",
    );
    expect(replacement).toContain(
      "->''lineage''->>''promptVersion'' IS DISTINCT FROM v_artifact.\"prompt_version\"",
    );
    expect(replacement).toContain("NOT IN (6, 7)");
    expect(replacement).toContain(
      "?& ARRAY[''schemaVersion'', ''modelVersion'', ''providerVersion'', ''promptVersion'', ''rulesVersion'', ''evalDatasetVersion'']",
    );
    expect(replacement).toContain(
      "? ''rankingPolicyVersion'') IS DISTINCT FROM (public.jsonb_object_length",
    );
    for (const key of [
      "schemaVersion",
      "modelVersion",
      "providerVersion",
      "promptVersion",
      "rulesVersion",
      "evalDatasetVersion",
      "rankingPolicyVersion",
    ]) {
      expect(replacement).toContain(
        `->''lineage''->''${key}'') IS DISTINCT FROM ''string''`,
      );
    }
    expect(replacement).toContain(
      "->>''schemaVersion'' IS DISTINCT FROM ''reader_summary.artifact.v1''",
    );
    for (const key of [
      "providerVersion",
      "rulesVersion",
      "evalDatasetVersion",
      "rankingPolicyVersion",
    ]) {
      expect(replacement).toContain(`btrim(v_artifact.\"artifact_payload\"->''lineage''->>''${key}'') = ''''`);
    }
  });

  it("preserves the recovery V4 model and prompt authority semantics", () => {
    const replacement = sql.slice(sql.indexOf("v_replacement CONSTANT TEXT"));
    expect(replacement).toContain(
      "= ''reader_summary.daily_canonical_recovery.v4'' AND (v_artifact.\"artifact_payload\"->''lineage''->>''modelVersion''",
    );
    expect(replacement).not.toContain("jsonb_build_object(''modelVersion''");
  });

  it("preserves function ownership and ACLs", () => {
    expect(sql).toContain(
      'SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"',
    );
    expect(sql).not.toContain("ALTER FUNCTION");
    expect(sql).not.toContain("GRANT ");
    expect(sql).not.toContain("REVOKE ");
    expect(sql).not.toContain("CASCADE");
  });
});
