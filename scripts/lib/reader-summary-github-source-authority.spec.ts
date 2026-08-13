import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migration =
  "prisma/migrations/20260813101000_reader_summary_github_source_authority/migration.sql";

describe("reader summary GitHub source authority migration", () => {
  const sql = readFileSync(resolve(migration), "utf8");

  it("is the latest guarded forward migration", () => {
    expect(readdirSync(resolve("prisma/migrations")).sort().at(-1)).toBe(
      "20260813101000_reader_summary_github_source_authority",
    );
    expect(sql).toContain("target diverged");
    expect(sql).toContain("rewrite is not exact");
  });

  it("binds the immutable source snapshot directly to its terminal scan receipt", () => {
    expect(sql).toContain("scan.\"status\" = ''SUCCEEDED''");
    expect(sql).toContain("scan.\"completed_at\" IS NOT NULL");
    expect(sql).toContain("scan.\"failure_class\" IS NULL");
    expect(sql).toContain("scan.\"failure_reason\" IS NULL");
    expect(sql).toContain("scan.\"execution_metadata\"->>''providerKey'' = ''github-trending-page''");
    expect(sql).toContain("scan.\"execution_metadata\"->>''acceptedItemCount''");
    expect(sql).toContain("targetPublishedWindowStartedAt");
    expect(sql).toContain("targetPublishedWindowEndedAt");
    expect(sql).not.toContain("v_canonical_url_replacement");
  });

  it("uses the domain case-folded repository identity without legacy result authority", () => {
    expect(sql).toContain("pg_catalog.lower(source.\"metadata\"->''repository''->>''fullName'')");
    expect(sql).toContain("= pg_catalog.lower(binding.value->>''repositoryIdentity'')");
    expect(sql).toContain("'\"github_repository_trend_results\" AS result'");
    expect(sql).toContain("'result.\"id\" IS NULL'");
    expect(sql).not.toContain("CASCADE");
  });

  it("temporarily grants schema CREATE while preserving function ACL ownership", () => {
    expect(sql).toContain("GRANT CREATE ON SCHEMA public");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public");
    expect(sql).not.toContain("GRANT EXECUTE");
    expect(sql).not.toContain("ALTER FUNCTION");
  });
});
