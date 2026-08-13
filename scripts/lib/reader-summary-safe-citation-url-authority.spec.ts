import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migration =
  "prisma/migrations/20260813100000_reader_summary_safe_citation_url_authority/migration.sql";
const evidenceMigration =
  "prisma/migrations/20260724020000_reader_summary_weekly_publication_evidence/migration.sql";

describe("reader summary safe citation URL authority migration", () => {
  const sql = readFileSync(resolve(migration), "utf8");
  const evidenceSql = readFileSync(resolve(evidenceMigration), "utf8");

  it("is the forward migration after the live lineage authority fix", () => {
    expect(readdirSync(resolve("prisma/migrations")).sort().at(-1)).toBe(
      "20260813100000_reader_summary_safe_citation_url_authority",
    );
  });

  it("guardedly removes exactly two source and one feed citation URL predicates", () => {
    expect(sql.match(/v_source_lock_needle CONSTANT TEXT/gu)).toHaveLength(1);
    expect(sql.match(/v_provider_needle CONSTANT TEXT/gu)).toHaveLength(1);
    expect(sql.match(/v_feed_lock_needle CONSTANT TEXT/gu)).toHaveLength(1);
    expect(sql).toContain(
      "reader summary citation URL authority rewrite target diverged",
    );
    expect(sql).toContain(
      "reader summary citation URL authority rewrite is not exact",
    );
    expect(sql).toContain(
      "pg_catalog.position(v_source_lock_needle IN v_definition) <> 0",
    );
    expect(sql).toContain(
      "pg_catalog.position(v_feed_lock_needle IN v_definition) <> 0",
    );
    expect(sql).toContain(
      "pg_catalog.position(v_provider_needle IN v_definition) <> 0",
    );
    expect(evidenceSql.match(
      /source\."canonical_url" = citation\.value->>'canonicalUrl'/gu,
    )).toHaveLength(2);
    expect(evidenceSql.match(
      /feed\."canonical_url" = citation\.value->>'canonicalUrl'/gu,
    )).toHaveLength(1);
  });

  it("preserves immutable source-feed URL binding and DB-owned provider URL", () => {
    expect(sql).toContain(
      `'AND feed."canonical_url" = source."canonical_url"'`,
    );
    expect(sql).toContain("2 * pg_catalog.length(v_source_feed_needle)");
    expect(sql).toContain(`'''canonicalUrl'', feed."canonical_url"'`);
    expect(sql).toContain("pg_catalog.length(v_provider_url_needle)");
    expect(evidenceSql.match(
      /feed\."canonical_url" = source\."canonical_url"/gu,
    )).toHaveLength(2);
    expect(evidenceSql).toContain(
      `'canonicalUrl', feed."canonical_url"`,
    );
    expect(sql).not.toContain("CASCADE");
  });

  it("uses a temporary schema CREATE grant without changing function ACLs", () => {
    expect(sql).toContain("GRANT CREATE ON SCHEMA public");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public");
    expect(sql).not.toContain("GRANT EXECUTE");
    expect(sql).not.toContain("REVOKE ALL ON FUNCTION");
    expect(sql).not.toContain("ALTER FUNCTION");
  });
});
