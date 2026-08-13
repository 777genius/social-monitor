import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migration =
  "prisma/migrations/20260813102000_reader_summary_github_provider_board_seal/migration.sql";

describe("reader summary GitHub provider board seal migration", () => {
  const sql = readFileSync(resolve(migration), "utf8");

  it("is the latest guarded forward migration", () => {
    expect(readdirSync(resolve("prisma/migrations")).sort().at(-1)).toBe(
      "20260813102000_reader_summary_github_provider_board_seal",
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
