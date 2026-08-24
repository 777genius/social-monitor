import { readFileSync } from "node:fs";

const migrationPath =
  "prisma/migrations/20260824120000_reader_summary_daily_model_job_telemetry/migration.sql";

describe("reader summary daily model telemetry migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("is additive, historical-safe, tenant-owned, and profile-valued", () => {
    expect(sql).toContain("@social-monitor-forward-migration");
    expect(sql).toContain("ADD COLUMN \"input_tokens\" BIGINT");
    expect(sql).toContain("ADD COLUMN \"total_tokens\" BIGINT");
    expect(sql).toContain("DEFAULT 'UNAVAILABLE'");
    expect(sql).toContain("SET \"usage_source\" = 'HISTORICAL_INCOMPLETE'");
    expect(sql).toContain("complete_reader_summary_daily_model_job_v2");
    expect(sql).toContain("social_monitor_reader_summary_daily_publication_definer");
    expect(sql).toContain("social_monitor_reader_summary_daily_terminal");
    expect(sql).toContain("verified_attestation->>'reasoningEffort'");
    expect(sql).toContain("v_job.\"reasoning_effort\"");
    expect(sql).toContain("v_receipt->'attestation' IS DISTINCT FROM verified_attestation");
    expect(sql).not.toMatch(/reasoningEffort'\s+IS DISTINCT FROM\s+'(?:xhigh|high)'/u);
  });

  it("discovers and switches to each allowlisted claim owner independently", () => {
    const statements = {
      begin: "BEGIN;",
      boundaryRoles: `INSERT INTO "reader_summary_daily_model_telemetry_session_roles" (
  "session_user_oid", "current_user_oid"
)
SELECT session_principal.oid, current_principal.oid
FROM pg_catalog.pg_roles AS session_principal
CROSS JOIN pg_catalog.pg_roles AS current_principal
WHERE session_principal.rolname = session_user
  AND current_principal.rolname = current_user;`,
      membershipGrant: `GRANT social_monitor_reader_summary_daily_publication_definer
  TO social_monitor_public_schema_owner
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;`,
      setSchemaOwner: "SET LOCAL ROLE social_monitor_public_schema_owner;",
      createGrant: `GRANT CREATE ON SCHEMA public
  TO social_monitor_reader_summary_daily_publication_definer;`,
      ownerTransfer: `ALTER FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) OWNER TO social_monitor_reader_summary_daily_publication_definer;`,
      createRevoke: `REVOKE CREATE ON SCHEMA public
  FROM social_monitor_reader_summary_daily_publication_definer;`,
      setDefiner: "SET LOCAL ROLE social_monitor_reader_summary_daily_publication_definer;",
      revokeLegacyExecute: `REVOKE ALL ON FUNCTION public."complete_reader_summary_daily_model_job"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR
) FROM social_monitor_reader_summary_daily_terminal;`,
      revokePublicExecute: `REVOKE ALL ON FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) FROM PUBLIC;`,
      grantTerminalExecute: `GRANT EXECUTE ON FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) TO social_monitor_reader_summary_daily_terminal;`,
      activeClaimRewrite: "DO $daily_active_claim_profile$",
      boundedClaimRewrite: "DO $daily_bounded_active_claim_profile$",
      ownerDiscovery: `SELECT proc.proowner, owner_role.rolname,
    pg_catalog.pg_get_functiondef(proc.oid)`,
      ownerAllowlist: `IF (v_owner_oid = ANY (ARRAY[
    v_session_user_oid,
    v_boundary_current_user_oid,
    pg_catalog.to_regrole('social_monitor_public_schema_owner')::OID,
    pg_catalog.to_regrole(
      'social_monitor_reader_summary_daily_publication_definer'
    )::OID
  ])) IS NOT TRUE THEN`,
      setDiscoveredOwner:
        "EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_owner_name);",
      resetToSession: "RESET ROLE;",
      membershipRevoke: `REVOKE social_monitor_reader_summary_daily_publication_definer
  FROM social_monitor_public_schema_owner GRANTED BY CURRENT_USER;`,
      commit: "COMMIT;",
    } as const;
    const orderedStatements = [
      statements.begin,
      statements.boundaryRoles,
      statements.membershipGrant,
      statements.setSchemaOwner,
      statements.createGrant,
      statements.ownerTransfer,
      statements.createRevoke,
      statements.setDefiner,
      statements.revokeLegacyExecute,
      statements.revokePublicExecute,
      statements.grantTerminalExecute,
      statements.resetToSession,
      statements.activeClaimRewrite,
      statements.ownerDiscovery,
      statements.ownerAllowlist,
      statements.setDiscoveredOwner,
      statements.resetToSession,
      statements.boundedClaimRewrite,
      statements.ownerDiscovery,
      statements.ownerAllowlist,
      statements.setDiscoveredOwner,
      statements.resetToSession,
      statements.membershipRevoke,
      statements.commit,
    ] as const;

    let previousIndex = -1;
    for (const statement of orderedStatements) {
      const statementIndex = sql.indexOf(statement, previousIndex + 1);
      expect(statementIndex).toBeGreaterThan(previousIndex);
      previousIndex = statementIndex;
    }

    for (const statement of [
      statements.membershipGrant,
      statements.createGrant,
      statements.createRevoke,
      statements.revokePublicExecute,
      statements.membershipRevoke,
    ]) {
      expect(sql.indexOf(statement)).toBe(sql.lastIndexOf(statement));
    }
    const afterCreateRevoke = sql.slice(
      sql.indexOf(statements.createRevoke) + statements.createRevoke.length,
      sql.indexOf(statements.commit),
    );
    const afterMembershipRevoke = sql.slice(
      sql.indexOf(statements.membershipRevoke) +
        statements.membershipRevoke.length,
      sql.indexOf(statements.commit),
    );
    expect(afterCreateRevoke).not.toContain(statements.createGrant);
    expect(afterMembershipRevoke).not.toContain(statements.membershipGrant);
    expect(sql.indexOf(statements.boundaryRoles)).toBeLessThan(
      sql.indexOf(statements.setSchemaOwner),
    );
    expect(sql).not.toMatch(
      /pg_catalog\.pg_roles\s+(?:AS\s+)?(?:session_role|current_role)\b/u,
    );
    expect(sql.match(/SELECT proc\.proowner, owner_role\.rolname,/gu)).toHaveLength(2);
    expect(sql.match(/IF \(v_owner_oid = ANY \(ARRAY\[/gu)).toHaveLength(2);
    expect(sql.match(/SET LOCAL ROLE %I/gu)).toHaveLength(2);
    expect(
      sql.match(/RAISE EXCEPTION 'daily active claim has unexpected owner';/gu),
    ).toHaveLength(1);
    expect(
      sql.match(
        /RAISE EXCEPTION 'bounded daily active claim has unexpected owner';/gu,
      ),
    ).toHaveLength(1);
    expect(sql).not.toMatch(/social_monitor_rls_admin_/u);
    const activeRewrite = sql.slice(
      sql.indexOf(statements.activeClaimRewrite),
      sql.indexOf(statements.boundedClaimRewrite),
    );
    const boundedRewrite = sql.slice(
      sql.indexOf(statements.boundedClaimRewrite),
      sql.indexOf(statements.membershipRevoke),
    );
    for (const rewrite of [activeRewrite, boundedRewrite]) {
      expect(rewrite).not.toMatch(
        /SET(?: LOCAL)? ROLE social_monitor_(?:public_schema_owner|reader_summary_daily_publication_definer)/u,
      );
      expect(rewrite).toContain(statements.ownerDiscovery);
      expect(rewrite).toContain(statements.ownerAllowlist);
      expect(rewrite).toContain(statements.setDiscoveredOwner);
      expect(rewrite.trimEnd().endsWith(statements.resetToSession)).toBe(true);
    }
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO PUBLIC;/u);
  });

  it("rejects unavailable completion and binds exact replay telemetry", () => {
    expect(sql).toContain("observed_usage_source NOT IN ('PROVIDER_REPORTED', 'ESTIMATED')");
    expect(sql).toContain("v_job.\"input_tokens\" IS DISTINCT FROM observed_input_tokens");
    expect(sql).toContain("v_job.\"duration_ms\" IS DISTINCT FROM observed_duration_ms");
    expect(sql).toContain("v_job.\"total_tokens\" IS DISTINCT FROM observed_total_tokens");
    expect(sql).toContain("observed_total_tokens <> observed_input_tokens + observed_output_tokens");
    expect(sql).toContain("v_receipt->'executionUsage'->>'usageSource'");
    expect(sql).toContain("daily COMPLETED telemetry replay diverged");
  });

  it("cuts both new daily claim paths over to the v2 high identity", () => {
    expect(sql).toContain("claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)");
    expect(sql).toContain("claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)");
    expect(sql).toContain("'''reader-summary-daily:v2'''");
    expect(sql).toContain("'''high'''");
    expect(sql).toContain("expected v1/xhigh definition");
    expect(sql).toContain("daily active claim has unexpected owner");
    expect(sql).toContain("bounded daily active claim has unexpected owner");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\."complete_reader_summary_daily_model_job"[\s\S]*?FROM social_monitor_reader_summary_daily_terminal/u,
    );
    expect(sql).toContain("verified_attestation->>'purpose' IS DISTINCT FROM");
    expect(sql).toContain("'social_monitor.reader_summary.generate.v2'");
  });
});
