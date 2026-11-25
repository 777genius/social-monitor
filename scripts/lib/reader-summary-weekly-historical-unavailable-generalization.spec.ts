import { readFileSync } from "node:fs";

const migrationPath =
  "prisma/migrations/20260814013000_reader_summary_weekly_historical_unavailable_generalization/migration.sql";

describe("reader summary weekly historical-unavailable generalization", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("removes the single-date exception while retaining zero-GitHub evidence guards", () => {
    expect(migration).toContain(
      "weekly daily certification historical-unavailable preimage diverged",
    );
    expect(migration).toContain(
      "weekly review manifest historical-unavailable preimage diverged",
    );
    expect(migration).toContain(
      "provider_item.value->>'providerKey' = 'github-trending-page'",
    );
    expect(migration).toContain("strpos(v_definition, v_old) = 0");
    expect(migration).toContain("EXECUTE v_definition");
    expect(migration).toContain("REVOKE CREATE ON SCHEMA public");
  });
});
