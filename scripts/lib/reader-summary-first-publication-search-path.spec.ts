import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static policy regression only: native PostgreSQL resolution is NOT exercised.
const migration = readFileSync(process.env.FIRSTPUB_REVIEW_MIGRATION_SOURCE ?? resolve(__dirname,
  "../../prisma/migrations/20261001220000_reader_summary_first_publication_finite_contract/migration.sql"), "utf8");
const names = ["assert_reader_summary_first_publication_scope", "reserve_reader_summary_first_publication",
  "lock_reader_summary_first_publication_dataset", "observe_reader_summary_first_publication"];

it.each(names)("%s explicitly places pg_temp after the trusted catalog", (name) => {
  const declaration = migration.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$function\\$`))?.[0];
  expect(declaration).toBeDefined();
  expect(declaration?.match(/^SET search_path = (.+)$/mu)?.[1]).toBe("pg_catalog, pg_temp");
});

it("retains session policy and resolves all physical table references through public explicitly", () => {
  expect(migration).toContain("SET LOCAL search_path = pg_catalog;");
  const references = [...migration.matchAll(/\b(?:FROM|JOIN|INTO|TABLE)\s+((?:public\.)?reader_summary_\w+)/giu)];
  expect(references.length).toBeGreaterThan(5);
  for (const reference of references) expect(reference[1]).toMatch(/^public\./u);
  expect(migration.match(/^CREATE FUNCTION /gmu)).toHaveLength(4);
});
