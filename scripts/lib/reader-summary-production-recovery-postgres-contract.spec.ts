import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  seedReaderSummaryProductionRecoveryFixture,
} from "./reader-summary-production-recovery-postgres-contract";

const root = process.cwd();
const migrationPaths = [
  "prisma/migrations/20260726170000_reader_summary_production_recovery_authority/migration.sql",
  "prisma/migrations/20260726170100_reader_summary_production_recovery_authority_prepare/migration.sql",
] as const;
const migration = migrationPaths
  .map((migrationPath) => readFileSync(join(root, migrationPath), "utf8"))
  .join("\n");
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
      rss: 75,
      "x-twitter": 67,
    });
    expect(expectedCountBlock("2026-07-24")).toEqual({
      "github-trending-page": 10,
      "hacker-news": 100,
      reddit: 100,
      rss: 67,
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
    ).toHaveLength(2);
    expect(
      migration.match(
        /AND binding\."interest_id" = feed\."interest_id"/gu,
      ),
    ).toHaveLength(2);
    expect(
      migration.match(/JOIN "source_catalog_entries" AS catalog/gu),
    ).toHaveLength(2);
    expect(
      migration.match(/AND catalog\."provider_key" = v_provider/gu),
    ).toHaveLength(1);
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
    const functions = migration.match(/\bCREATE FUNCTION\b/gu) ?? [];
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
  const start = migration.indexOf(`WHEN DATE '${date}'`);
  const end = migration.indexOf(nextDate, start + 1);
  const block = migration.slice(start, end);
  return Object.fromEntries(
    [...block.matchAll(
      /'providerKey', '([^']+)', 'count', (\d+)/gu,
    )].map((match) => [match[1]!, Number(match[2])]),
  );
};
