import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  seedReaderSummaryProductionRecoveryFixture,
} from "./reader-summary-production-recovery-postgres-contract";

const root = process.cwd();
const runtimeExecuteMigrationPath =
  "prisma/migrations/20260728143000_reader_summary_production_recovery_prepare_runtime_execute/migration.sql";
const scopeAclMigrationPath =
  "prisma/migrations/20260728151000_reader_summary_production_recovery_scope_acl/migration.sql";
const sourceBindingsAclMigrationPath =
  "prisma/migrations/20260728162000_reader_summary_production_recovery_source_bindings_acl/migration.sql";
const migrationPaths = [
  "prisma/migrations/20260726170000_reader_summary_production_recovery_authority/migration.sql",
  "prisma/migrations/20260726170100_reader_summary_production_recovery_authority_prepare/migration.sql",
  "prisma/migrations/20260727151000_reader_summary_production_recovery_observed_window/migration.sql",
  "prisma/migrations/20260727154500_reader_summary_production_recovery_collection_windows/migration.sql",
  "prisma/migrations/20260728033000_reader_summary_production_recovery_jul23_jul24_authority/migration.sql",
  "prisma/migrations/20260728123000_reader_summary_production_recovery_published_counts_authority/migration.sql",
  runtimeExecuteMigrationPath,
  scopeAclMigrationPath,
  sourceBindingsAclMigrationPath,
] as const;
const migration = migrationPaths
  .map((migrationPath) => readFileSync(join(root, migrationPath), "utf8"))
  .join("\n");
const publishedAuthorityMigration = readFileSync(
  join(root, migrationPaths[5]),
  "utf8",
);
const runtimeExecuteMigration = readFileSync(
  join(root, runtimeExecuteMigrationPath),
  "utf8",
);
const scopeAclMigration = readFileSync(
  join(root, scopeAclMigrationPath),
  "utf8",
);
const sourceBindingsAclMigration = readFileSync(
  join(root, sourceBindingsAclMigrationPath),
  "utf8",
);
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const tenantGuard = JSON.parse(
  readFileSync(
    join(root, "ops/security/tenant-db-guard-contract.json"),
    "utf8",
  ),
) as {
  rlsMigrationPaths: string[];
  forwardRlsCoverage: Array<{ table: string; ownerRole: string }>;
  tenantOwnedTables: string[];
  tenantScopedAssociations: Array<{
    childTable: string;
    parentTable: string;
  }>;
};
const backup = JSON.parse(
  readFileSync(
    join(root, "ops/recovery/backup-restore-contract.json"),
    "utf8",
  ),
) as {
  backupIncludes: string[];
  operationalStateTables: string[];
  restoreValidationQueries: string[];
};
const retention = JSON.parse(
  readFileSync(
    join(root, "ops/privacy/retention-contract.json"),
    "utf8",
  ),
) as {
  tables: Array<{
    table: string;
    deleteMode: string;
    legalHoldAware: boolean;
  }>;
};

const recoveryTables = [
  "reader_summary_production_recovery_days",
  "reader_summary_production_recovery_dry_runs",
  "reader_summary_production_recovery_leases",
] as const;

describe("reader summary production recovery PostgreSQL contract", () => {
  it("seeds only the isolated reviewed dates plus a July 21 sentinel", async () => {
    const queries: string[] = [];
    await seedReaderSummaryProductionRecoveryFixture({
      query: async (sql) => {
        queries.push(sql);
        return { rows: [] };
      },
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("DATE '2026-07-23'");
    expect(queries[0]).toContain("DATE '2026-07-24'");
    expect(queries[0]).toContain("jul21-sentinel");
    expect(queries[0]).toContain("interval '8 hours'");
    expect(queries[0]).toContain("interval '12 hours'");
    expect(queries[0]).toContain("interval '11 hours'");
    expect(queries[0]).not.toContain("interval '2 days'");
    expect(queries[0]).not.toContain("interval '1 day' + interval '12 hours'");
    expect(queries[0]).not.toContain("interval '1 day' + interval '11 hours'");
    expect(queries[0]).toContain("observed_at");
    expect(queries[0]).toContain(
      "github_repository_trend_results",
    );
  });

  it("models the lease, immutable days and two dry-run snapshots", () => {
    expect(schema).toContain(
      "model ReaderSummaryProductionRecoveryLease {",
    );
    expect(schema).toContain(
      "model ReaderSummaryProductionRecoveryDay {",
    );
    expect(schema).toContain(
      "model ReaderSummaryProductionRecoveryDryRun {",
    );
    for (const table of recoveryTables) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
      expect(migration).toContain(`ON "${table}"`);
    }
    expect(migration).toContain(
      '"ordinal" SMALLINT NOT NULL',
    );
    expect(migration).toContain(
      'CHECK ("ordinal" IN (1, 2))',
    );
    expect(migration).toContain(
      "production recovery evidence is immutable",
    );
    expect(migration).toContain(
      "production recovery lease is immutable",
    );
  });

  it("derives the exact reviewed provider totals and GitHub modes", () => {
    expect(migration).toContain(
      "WHEN DATE '2026-07-23' THEN jsonb_build_array(",
    );
    expect(migration).toContain(
      "WHEN DATE '2026-07-24' THEN jsonb_build_array(",
    );
    expect(expectedCountBlock("2026-07-23")).toEqual({
      "github-trending-page": 0,
      "hacker-news": 100,
      reddit: 100,
      rss: 78,
      "x-twitter": 67,
    });
    expect(expectedCountBlock("2026-07-24")).toEqual({
      "github-trending-page": 10,
      "hacker-news": 100,
      reddit: 100,
      rss: 68,
      "x-twitter": 73,
    });
    expect(migration).toContain("'historical_unavailable'");
    expect(migration).toContain(
      "'reader_summary.production_recovery.github.2026-07-23.v1'",
    );
    expect(migration).toContain("'verified_existing'");
    expect(migration).toContain(
      'JOIN "github_repository_trend_results" AS result',
    );
    expect(migration).toContain(
      'JOIN "scan_attempts" AS attempt',
    );
    expect(migration).toContain(
      '"reader_summary_production_recovery_evidence_is_valid"',
    );
    expect(migration).toContain(
      'source."content_hash" ~ \'^[0-9a-f]{64}$\'',
    );
    expect(migration).toContain(
      'source."provider_content_hash" ~ \'^[0-9a-f]{64}$\'',
    );
    expect(
      migration.match(/JOIN "source_bindings" AS binding/gu),
    ).toHaveLength(10);
    expect(
      migration.match(
        /AND binding\."interest_id" = feed\."interest_id"/gu,
      ),
    ).toHaveLength(10);
    expect(
      migration.match(/JOIN "source_catalog_entries" AS catalog/gu),
    ).toHaveLength(10);
    expect(
      migration.match(/AND catalog\."provider_key" = v_provider/gu),
    ).toHaveLength(5);
  });

  it("requires two canonical byte-identical snapshots before lease consumption", () => {
    const firstSnapshot = migration.indexOf(
      'INSERT INTO "reader_summary_production_recovery_dry_runs"',
    );
    const secondSnapshot = migration.indexOf(
      'INSERT INTO "reader_summary_production_recovery_dry_runs"',
      firstSnapshot + 1,
    );
    const equalityCheck = migration.indexOf(
      "v_plan_second_bytes IS DISTINCT FROM v_plan_bytes",
    );
    const consume = migration.indexOf(
      'UPDATE "reader_summary_production_recovery_leases"',
    );

    expect(firstSnapshot).toBeGreaterThan(0);
    expect(secondSnapshot).toBeGreaterThan(firstSnapshot);
    expect(equalityCheck).toBeGreaterThan(secondSnapshot);
    expect(consume).toBeGreaterThan(equalityCheck);
    expect(migration).toContain(
      "v_plan_second_sha IS DISTINCT FROM v_plan_sha",
    );
    expect(migration).toContain(
      "'stage', 'pre_model'",
    );
    expect(migration).toContain(
      "'modelCallPerformed', FALSE",
    );
    expect(migration).toContain(
      "'publicationPerformed', FALSE",
    );
    expect(migration).toContain(
      "'recollectionPerformed', FALSE",
    );
  });

  it("replaces recovery authority functions with exact Jul23/Jul24 published-at authority counts", () => {
    expect(publishedAuthorityMigration).toContain(
      'CREATE OR REPLACE FUNCTION "reader_summary_production_recovery_expected_counts"',
    );
    expect(publishedAuthorityMigration).toContain(
      'CREATE OR REPLACE FUNCTION "derive_reader_summary_production_recovery_day"',
    );
    expect(publishedAuthorityMigration).toContain(
      'CREATE OR REPLACE FUNCTION "prepare_reader_summary_production_recovery"',
    );
    expect(
      publishedAuthorityMigration.match(
        /feed\."published_at" AT TIME ZONE 'UTC'/gu,
      ),
    ).toHaveLength(2);
    expect(publishedAuthorityMigration).toContain(
      "v_collection_start := target_date;",
    );
    expect(publishedAuthorityMigration).toContain(
      "v_collection_end := target_date + 1;",
    );
    expect(publishedAuthorityMigration).not.toContain(
      "v_collection_start := target_date + 1;",
    );
    expect(publishedAuthorityMigration).not.toContain(
      "v_collection_end := target_date + 2;",
    );
    expect(publishedAuthorityMigration).toContain(
      'AND feed."published_at" >=\n          (v_collection_start::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      'AND feed."published_at" <\n          (v_collection_end::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      'AND feed."published_at" >=\n        (DATE \'2026-07-23\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      'AND feed."published_at" <\n        (DATE \'2026-07-25\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      'WHERE feed."published_at" <\n            (DATE \'2026-07-24\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      'WHERE feed."published_at" >=\n            (DATE \'2026-07-24\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      'AND count(*) FILTER (\n        WHERE feed."published_at" <\n            (DATE \'2026-07-24\'::TIMESTAMP AT TIME ZONE \'UTC\')\n          AND feed."provider_key" = \'rss\'\n      ) = 78',
    );
    expect(publishedAuthorityMigration).not.toMatch(
      /FILTER \(\s*WHERE\s+WHERE\s+feed\."published_at"/u,
    );
    expect(publishedAuthorityMigration).toContain(
      'AND result."checked_at" >=\n      (DATE \'2026-07-24\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      'AND result."checked_at" <\n      (DATE \'2026-07-25\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).not.toContain(
      'AND feed."published_at" <\n        (DATE \'2026-07-26\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).not.toContain("DATE '2026-07-26'");
    expect(publishedAuthorityMigration).not.toContain(
      'WHERE feed."published_at" <\n            (DATE \'2026-07-25\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).not.toContain(
      'WHERE feed."published_at" >=\n            (DATE \'2026-07-25\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).not.toContain(
      'AND result."checked_at" >=\n      (DATE \'2026-07-25\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).not.toContain(
      'AND feed."observed_at" >=\n          (v_collection_start::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).not.toContain(
      '(target_date::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).not.toContain(
      'AND feed."observed_at" >=\n        (DATE \'2026-07-23\'::TIMESTAMP AT TIME ZONE \'UTC\')',
    );
    expect(publishedAuthorityMigration).toContain(
      "jsonb_build_object('providerKey', 'rss', 'count', 68)",
    );
    expect(publishedAuthorityMigration).not.toContain("EXECUTE v_definition");
    expect(publishedAuthorityMigration).toContain(
      'GRANT EXECUTE ON FUNCTION\n  "prepare_reader_summary_production_recovery"()\nTO "social_monitor_reader_summary_publication_runtime"',
    );
    expect(
      publishedAuthorityMigration.match(/GRANT EXECUTE ON FUNCTION/gu),
    ).toHaveLength(1);
    expect(publishedAuthorityMigration).not.toMatch(
      /GRANT\s+[^;]*\b(?:INSERT|UPDATE|DELETE)\b[^;]*;/iu,
    );
  });

  it("forwards only prepare execute authority to the publication runtime", () => {
    const prepareExecuteGrant =
      'GRANT EXECUTE ON FUNCTION\n  "prepare_reader_summary_production_recovery"()\nTO "social_monitor_reader_summary_publication_runtime";';

    expect(runtimeExecuteMigration).toContain(prepareExecuteGrant);
    expect(
      runtimeExecuteMigration.match(/\bGRANT\b[\s\S]*?;/gu),
    ).toEqual([prepareExecuteGrant]);
    expect(runtimeExecuteMigration).not.toMatch(
      /\b(?:validate_reader_summary_production_recovery|reader_summary_production_recovery_expected_counts|derive_reader_summary_production_recovery_day|reader_summary_production_recovery_evidence_is_valid)\b/u,
    );
    expect(runtimeExecuteMigration).not.toMatch(
      /\bGRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/iu,
    );
    expect(runtimeExecuteMigration).not.toMatch(
      /\b(?:CREATE|ALTER|DROP)\s+(?:FUNCTION|TABLE|POLICY)\b/iu,
    );
    expect(runtimeExecuteMigration).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\b/iu,
    );
  });

  it("grants only scoped tenant/workspace lock authority to the publication owner", () => {
    const tenantSelectGrant =
      "GRANT SELECT(id, deleted_at) ON public.tenants TO social_monitor_reader_summary_publication_owner;";
    const workspaceSelectGrant =
      "GRANT SELECT(id, tenant_id, deleted_at) ON public.workspaces TO social_monitor_reader_summary_publication_owner;";
    const rowLockGrant =
      "GRANT UPDATE(id) ON public.tenants, public.workspaces TO social_monitor_reader_summary_publication_owner;";

    expect(scopeAclMigration).toContain(
      "SET LOCAL ROLE social_monitor_public_schema_owner;",
    );
    expect(scopeAclMigration).toContain(tenantSelectGrant);
    expect(scopeAclMigration).toContain(workspaceSelectGrant);
    expect(scopeAclMigration).toContain(rowLockGrant);
    expect(scopeAclMigration.match(/\bGRANT\b[\s\S]*?;/gu)).toEqual([
      tenantSelectGrant,
      workspaceSelectGrant,
      rowLockGrant,
    ]);
    expect(scopeAclMigration).not.toMatch(
      /\bGRANT\s+SELECT\b(?!\s*\()/iu,
    );
    expect(scopeAclMigration).not.toMatch(
      /\bGRANT\s+UPDATE\b(?!\s*\()/iu,
    );
    expect(scopeAclMigration).not.toMatch(
      /\bGRANT\s+(?:INSERT|DELETE|TRUNCATE|REFERENCES|TRIGGER|EXECUTE)\b/iu,
    );
    expect(scopeAclMigration).not.toContain(
      "social_monitor_reader_summary_publication_runtime",
    );
    expect(scopeAclMigration).not.toMatch(
      /\b(?:CREATE|ALTER|DROP)\s+(?:FUNCTION|TABLE|POLICY)\b/iu,
    );
  });

  it("grants only scoped source binding authority to the publication owner", () => {
    const sourceBindingSelectGrant =
      "GRANT SELECT(id, tenant_id, workspace_id, interest_id, source_catalog_entry_id, status, deleted_at, config) ON public.source_bindings TO social_monitor_reader_summary_publication_owner;";
    const sourceBindingRowLockGrant =
      "GRANT UPDATE(id) ON public.source_bindings TO social_monitor_reader_summary_publication_owner;";

    expect(sourceBindingsAclMigration).toContain(
      "SET LOCAL ROLE social_monitor_public_schema_owner;",
    );
    expect(sourceBindingsAclMigration).toContain(sourceBindingSelectGrant);
    expect(sourceBindingsAclMigration).toContain(sourceBindingRowLockGrant);
    expect(
      sourceBindingsAclMigration.match(/\bGRANT\b[\s\S]*?;/gu),
    ).toEqual([sourceBindingSelectGrant, sourceBindingRowLockGrant]);
    expect(sourceBindingsAclMigration).not.toMatch(
      /\bGRANT\s+SELECT\b(?!\s*\()/iu,
    );
    expect(sourceBindingsAclMigration).not.toMatch(
      /\bGRANT\s+UPDATE\b(?!\s*\()/iu,
    );
    expect(sourceBindingsAclMigration).not.toMatch(
      /\bGRANT\s+(?:INSERT|DELETE|TRUNCATE|REFERENCES|TRIGGER|EXECUTE)\b/iu,
    );
    expect(sourceBindingsAclMigration).not.toContain(
      "social_monitor_reader_summary_publication_runtime",
    );
    expect(sourceBindingsAclMigration).not.toMatch(
      /\b(?:CREATE|ALTER|DROP)\s+(?:FUNCTION|TABLE|POLICY)\b/iu,
    );
  });

  it("uses deterministic identity, SERIALIZABLE row locking and fixed paths", () => {
    expect(migration).toContain(
      "'reader_summary.production_recovery.v1:' || v_identity_sha",
    );
    expect(migration).toContain(
      '"reader_summary_production_recovery_uuid"(v_identity_sha)',
    );
    expect(migration).toContain(
      "current_setting('transaction_isolation') <> 'serializable'",
    );
    expect(migration).toContain(
      "current_setting('social_monitor.tenant_id', TRUE)",
    );
    expect(migration).toContain(
      "current_setting('social_monitor.workspace_id', TRUE)",
    );
    expect(migration).toMatch(
      /ORDER BY tenant\."id"\s+FOR UPDATE/u,
    );
    expect(migration).toMatch(
      /ORDER BY workspace\."id"\s+FOR UPDATE/u,
    );
    expect(migration).toMatch(
      /ORDER BY binding\."id"\s+FOR SHARE/u,
    );
    expect(migration).toMatch(
      /ORDER BY feed\."id"\s+FOR SHARE/u,
    );
    expect(migration).not.toMatch(/\bLOCK\s+TABLE\b/iu);
    expect(migration).not.toMatch(/\bLOCK\s+"[^"]+"/iu);
    const functions =
      migration.match(/\bCREATE(?: OR REPLACE)? FUNCTION\b/gu) ?? [];
    const fixedPaths =
      migration.match(
        /SET search_path = pg_catalog, public, pg_temp/gu,
      ) ?? [];
    expect(fixedPaths).toHaveLength(functions.length);
  });

  it("exposes only the no-argument prepare capability to runtime", () => {
    expect(migration).toContain(
      'SECURITY DEFINER\nSET search_path = pg_catalog, public, pg_temp',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION\n  "prepare_reader_summary_production_recovery"()\nTO "social_monitor_reader_summary_publication_runtime"',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON FUNCTION',
    );
    expect(migration).toContain(
      '"reader_summary_production_recovery_evidence_is_valid"(JSONB, TEXT)',
    );
    expect(migration).not.toMatch(
      /INSERT INTO\s+"reader_summary_(jobs|artifacts|publications|publication_slots|recovery_receipts)"/iu,
    );
    expect(migration).not.toMatch(
      /\b(?:UPDATE|DELETE FROM)\s+"(?:feed_items|source_items)"/iu,
    );
    expect(migration).not.toMatch(
      /\b(?:openai|anthropic|model_gateway|generate_summary)\b/iu,
    );
    expect(migration).not.toContain("DATE '2026-07-21'");
    expect(packageJson).toContain(
      '"check:reader-summary-production-recovery-postgres"',
    );
  });

  it("registers RLS, cross-tenant FKs, backup and legal-hold retention", () => {
    expect(tenantGuard.rlsMigrationPaths).toContain(
      migrationPaths[0],
    );
    for (const table of recoveryTables) {
      expect(tenantGuard.tenantOwnedTables).toContain(table);
      expect(tenantGuard.forwardRlsCoverage).toContainEqual(
        expect.objectContaining({
          table,
          ownerRole:
            "social_monitor_reader_summary_publication_owner",
        }),
      );
      expect(backup.backupIncludes).toContain(table);
      expect(backup.operationalStateTables).toContain(table);
      expect(backup.restoreValidationQueries).toContain(
        `select count(*) from ${table}`,
      );
      expect(retention.tables).toContainEqual(
        expect.objectContaining({
          table,
          deleteMode:
            "owner_authorized_graph_purge_after_retention",
          legalHoldAware: true,
        }),
      );
    }
    expect(tenantGuard.tenantScopedAssociations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childTable: "reader_summary_production_recovery_days",
          parentTable: "reader_summary_production_recovery_leases",
        }),
        expect.objectContaining({
          childTable: "reader_summary_production_recovery_dry_runs",
          parentTable: "reader_summary_production_recovery_leases",
        }),
      ]),
    );
  });
});

const expectedCountBlock = (
  date: "2026-07-23" | "2026-07-24",
): Record<string, number> => {
  const nextDate = date === "2026-07-23" ? "2026-07-24" : "ELSE NULL";
  const start = publishedAuthorityMigration.indexOf(`WHEN DATE '${date}'`);
  const end = publishedAuthorityMigration.indexOf(nextDate, start + 1);
  const block = publishedAuthorityMigration.slice(start, end);
  return Object.fromEntries(
    [...block.matchAll(
      /'providerKey', '([^']+)', 'count', (\d+)/gu,
    )].map((match) => [match[1]!, Number(match[2])]),
  );
};
