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

  it("guardedly rewrites exactly two source and one feed citation URL predicates", () => {
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
      "pg_catalog.strpos(v_definition, v_source_lock_needle) <> 0",
    );
    expect(sql).toContain(
      "pg_catalog.strpos(v_definition, v_feed_lock_needle) <> 0",
    );
    expect(sql).toContain(
      "pg_catalog.strpos(v_definition, v_provider_needle) <> 0",
    );
    expect(evidenceSql.match(
      /source\."canonical_url" = citation\.value->>'canonicalUrl'/gu,
    )).toHaveLength(2);
    expect(evidenceSql.match(
      /feed\."canonical_url" = citation\.value->>'canonicalUrl'/gu,
    )).toHaveLength(1);
    expect(sql.match(
      /public\.reader_summary_safe_citation_url\((?:source|feed)\."canonical_url"\) = citation\.value->>''canonicalUrl''/gu,
    )).toHaveLength(3);
  });

  it("derives the strict display-safe URL used by summary citations", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.reader_summary_safe_citation_url(",
    );
    expect(sql).toContain("LANGUAGE plpgsql");
    expect(sql).toContain("IMMUTABLE");
    expect(sql).toContain("STRICT");
    expect(sql).toContain("PARALLEL SAFE");
    expect(sql).toContain("SET search_path = pg_catalog");
    expect(sql).toContain("pg_catalog.regexp_replace(v_match[2], '^.*@', '')");
    expect(sql).toContain("pg_catalog.regexp_replace(v_host, '^www[.]', '') = 'news.ycombinator.com'");
    expect(sql).toContain("'(^|&)id=([0-9]+)(&|$)'");
    expect(sql).toContain("CASE WHEN v_path = '/' THEN '' ELSE v_path END");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.reader_summary_safe_citation_url(TEXT)");
    expect(sql).toContain("FROM PUBLIC");
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
    expect(sql).not.toContain("ALTER FUNCTION");
  });
});
