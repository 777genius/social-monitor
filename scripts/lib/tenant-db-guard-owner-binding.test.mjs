import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { migrationBindsTableOwner } from "./tenant-db-guard-owner-binding.mjs";

const ownerRole = "social_monitor_public_schema_owner";
const receiptTables = [
  "reader_summary_promotion_v2_rollback_receipts",
  "reader_summary_promotion_v2_canary_publication_receipts",
];
const migrationSql = readFileSync(
  "prisma/migrations/20260831120000_reader_summary_promotion_v2_rollback/migration.sql",
  "utf8",
);
const preMigrationSql = readFileSync(
  "ops/deploy/reader-summary-publication-pre-migration.sql",
  "utf8",
);
const postMigrationSql = readFileSync(
  "ops/deploy/reader-summary-publication-post-migration.sql",
  "utf8",
);

test("each Promotion V2 receipt creation is bound to its schema owner", () => {
  for (const table of receiptTables) {
    assert.equal(
      migrationBindsTableOwner({ sql: migrationSql, table, ownerRole }),
      true,
      table,
    );
  }
});

test("the original canary wrong-role creation is rejected", () => {
  const ownerCreation = `SET LOCAL ROLE "${ownerRole}";
CREATE TABLE public."reader_summary_promotion_v2_canary_publication_receipts"`;
  const mismatchedMigration = migrationSql.replace(
    ownerCreation,
    `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
CREATE TABLE public."reader_summary_promotion_v2_canary_publication_receipts"`,
  );
  assert.notEqual(mismatchedMigration, migrationSql);
  assert.equal(
    migrationBindsTableOwner({
      sql: mismatchedMigration,
      table: receiptTables[1],
      ownerRole,
    }),
    false,
  );
});

test("an unrelated owner SET cannot bless a later wrong-role creation", () => {
  const sql = `
    SET LOCAL ROLE "${ownerRole}";
    CREATE TABLE "unrelated" (id uuid);
    RESET ROLE;
    SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
    CREATE TABLE public."receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("an explicit post-creation ALTER OWNER binds a wrong-role creation", () => {
  const sql = `
    SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
    CREATE TABLE public."receipt" (id uuid);
    ALTER TABLE public."receipt" OWNER TO "${ownerRole}";
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("a later wrong ALTER OWNER invalidates a correctly owned creation", () => {
  const sql = `
    SET LOCAL ROLE "${ownerRole}";
    CREATE TABLE public."receipt" (id uuid);
    ALTER TABLE public."receipt"
      OWNER TO "social_monitor_reader_summary_publication_owner";
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("pre and post deploy audits require the exact optional receipt inventory", () => {
  for (const [name, sql] of [
    ["pre", preMigrationSql],
    ["post", postMigrationSql],
  ]) {
    const audit = sql.slice(
      sql.indexOf("SELECT count(*) INTO v_promotion_v2_receipt_table_count"),
      sql.indexOf("END IF;", sql.indexOf(
        "SELECT count(*) INTO v_promotion_v2_receipt_table_count",
      )) + "END IF;".length,
    );
    assert.notEqual(audit.length, 0, `${name} receipt ownership audit`);
    for (const table of receiptTables) assert.ok(audit.includes(`'${table}'`));
    assert.ok(audit.includes("v_promotion_v2_receipt_table_count NOT IN (0, 2)"));
    assert.ok(audit.includes(
      "v_promotion_v2_receipt_owner_count <>\n      v_promotion_v2_receipt_table_count",
    ));
    assert.ok(audit.includes(`owner.rolname = '${ownerRole}'`));
  }
});

test("ordinary pre-migration handoff excludes each receipt table once per list", () => {
  const handoff = preMigrationSql.slice(
    preMigrationSql.indexOf("DO $tenant_table_ownership_transfer$"),
    preMigrationSql.indexOf("$tenant_table_ownership_transfer$;") +
      "$tenant_table_ownership_transfer$;".length,
  );
  for (const table of receiptTables) {
    assert.equal(handoff.split(`'${table}'`).length - 1, 3, table);
  }
});
