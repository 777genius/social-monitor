import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migrationName =
  "20260813102000_reader_summary_github_provider_board_seal";
const migration = `prisma/migrations/${migrationName}/migration.sql`;

describe("reader summary GitHub provider board seal migration", () => {
  const sql = readFileSync(resolve(migration), "utf8");

  it("remains the latest guarded publisher rewrite", () => {
    const laterMigrationSql = readdirSync(resolve("prisma/migrations"))
      .filter((name) => name > migrationName)
      .sort()
      .map((name) =>
        readFileSync(resolve("prisma/migrations", name, "migration.sql"), "utf8"),
      )
      .join("\n");
    expect(laterMigrationSql).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?"?publish_reader_summary"?/iu,
    );
    expect(sql).toContain("target diverged");
    expect(sql).toContain("rewrite is not exact");
  });

  it("derives one deterministic board seal from ordered exact item hashes", () => {
    expect(sql).toContain("reader_summary.github_provider_board.v1");
    expect(sql).toContain("''requestedUtcDay'', to_char(v_day, ''YYYY-MM-DD'')");
    expect(sql).toContain("sourceProviderContentHashes");
    expect(sql).toContain("ORDER BY (value->>''rank'')::INTEGER");
    expect(sql).toContain("''sourceProviderContentHash'', board.sha256");
    expect(sql).toContain(
      "'count(DISTINCT binding->>''sourceProviderContentHash'')'",
    );
  });

  it("preserves ownership and ACL while replacing only the legacy aggregate", () => {
    expect(sql).toContain("GRANT CREATE ON SCHEMA public");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public");
    expect(sql).not.toContain("GRANT EXECUTE");
    expect(sql).not.toContain("CASCADE");
  });
});
