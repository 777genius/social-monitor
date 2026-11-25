import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260801213000_reader_summary_production_recovery_gap_authority_v3/migration.sql",
  ),
  "utf8",
);
const gapContract = readFileSync(join(
  process.cwd(),
  "scripts/lib/reader-summary-production-recovery-gap-postgres-contract.ts",
), "utf8");
const recoveryChecker = readFileSync(join(
  process.cwd(),
  "scripts/check-reader-summary-production-recovery-postgres.ts",
), "utf8");
const originalCutoffFixture = readFileSync(join(
  process.cwd(),
  "scripts/lib/reader-summary-production-recovery-original-cutoff-postgres-fixture.ts",
), "utf8");

describe("reader summary production recovery gap postgres contract", () => {
  it("is forward-only, fixed-search-path, least privilege, and row-lock based", () => {
    expect(migration).toContain("-- @social-monitor-forward-migration");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).not.toContain("pg_temp");
    expect(migration).toContain("FOR UPDATE OF workspace");
    expect(migration).toContain("FOR SHARE OF feed, source, binding, catalog, interest");
    expect(migration).toContain(
      'GRANT UPDATE("id") ON "source_catalog_entries" TO "social_monitor_reader_summary_publication_owner"',
    );
    expect(migration).not.toContain(
      'GRANT UPDATE("provider_key") ON "source_catalog_entries"',
    );
    expect(migration).not.toMatch(/\bLOCK\s+TABLE\b/iu);
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON FUNCTION\n  "read_reader_summary_production_recovery_gap_v3"',
    );
    expect(migration).toContain(
      'TO "social_monitor_reader_summary_publication_runtime"',
    );
  });

  it("never recollects or mutates provider evidence", () => {
    expect(migration).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:feed_items|source_items|github_repository_trend_results)\b/iu,
    );
    expect(migration).toContain("immutable DB multiset diverged");
    expect(migration).toContain("providerEvidenceSha256");
  });

  it("removes only the synthetic Jul29 RSS collision after the v2 contract", () => {
    expect(originalCutoffFixture).toContain(
      "(4, DATE '2026-07-24', 68, TIMESTAMPTZ '2026-07-29T08:00:00.004Z')",
    );
    expect(originalCutoffFixture).toContain(
      "TIMESTAMPTZ '2026-07-30T12:00:00Z'",
    );
    expect(gapContract).toContain(
      "removeOriginalCutoffGapFixtureCollision",
    );
    expect(gapContract).toMatch(
      /provider_key = 'rss'\s+AND published_at =\s+TIMESTAMPTZ '2026-07-29T08:00:00\.004Z'/u,
    );
    expect(gapContract).toContain("feed.rows[0]?.removed === 1");
    expect(gapContract).toContain("source.rows[0]?.removed === 1");
    const v2 = recoveryChecker.indexOf(
      "await assertReaderSummaryProductionRecoveryPostgresContract",
    );
    const collision = recoveryChecker.indexOf(
      "await removeOriginalCutoffGapFixtureCollision",
    );
    const gap = recoveryChecker.indexOf(
      "await assertReaderSummaryProductionRecoveryGapPostgresContract",
    );
    expect(v2).toBeGreaterThan(-1);
    expect(collision).toBeGreaterThan(v2);
    expect(gap).toBeGreaterThan(collision);
  });

  it("requires exact Jul29-Jul31 plans, coverage, dominance and model contract", () => {
    expect(migration).toContain(
      '["2026-07-29", "2026-07-30", "2026-07-31"]',
    );
    expect(migration).toContain("first_plan IS DISTINCT FROM second_plan");
    expect(migration).toContain("v_authority_record := (first_plan - 'days')");
    expect(migration).not.toContain(
      '"reader_summary_production_recovery_canonical_json"(first_plan)',
    );
    expect(migration).toContain("maximumRatioBasisPoints");
    expect(migration).toContain("modelEligibility");
    expect(migration).toContain("gpt-5.6-sol");
    expect(migration).toContain("subscription-runtime-cli");
    expect(migration).toContain("authorityCutoffAt");
    expect(migration).toContain("canonicalIngestedAt");
    expect(migration).toContain('feed."observed_at" <= c_authority_cutoff');
    expect(migration).toContain('feed."created_at" <= c_authority_cutoff');
    expect(migration).toContain('source."observed_at" <= c_authority_cutoff');
    expect(migration).toContain('source."created_at" <= c_authority_cutoff');
    expect(migration).toContain("'terminalOutcome'");
  });
});
