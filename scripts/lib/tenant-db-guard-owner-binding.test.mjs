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
const receiptOwnerAuditTag = "$promotion_v2_receipt_owner_audit$";

function receiptOwnerAudit(sql) {
  const start = sql.indexOf(`DO ${receiptOwnerAuditTag}`);
  const end = sql.indexOf(`${receiptOwnerAuditTag};`, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.equal(sql.indexOf(`DO ${receiptOwnerAuditTag}`, start + 1), -1);
  return {
    body: sql.slice(start, end + receiptOwnerAuditTag.length + 1),
    start,
  };
}

function hasExactReceiptOwnerMapping(audit) {
  return receiptTables.every((table) =>
    audit.includes(`'${table}'::NAME,\n        '${ownerRole}'::NAME`)
  );
}

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

test("pre and post deploy audits share the exact receipt-owner mapping", () => {
  const auditBodies = [];
  for (const [name, sql] of [
    ["pre", preMigrationSql],
    ["post", postMigrationSql],
  ]) {
    const audit = receiptOwnerAudit(sql);
    auditBodies.push(audit.body);
    assert.equal(hasExactReceiptOwnerMapping(audit.body), true, name);
    assert.ok(audit.body.includes("relation.relkind NOT IN ('r', 'p')"));
    assert.ok(audit.body.includes("owner.rolname <> expected.owner_name"));
    assert.ok(audit.start < sql.indexOf("DO $bootstrap$"));
    assert.equal(
      /\b(?:ALTER|CREATE|DELETE|GRANT|INSERT|REVOKE|UPDATE)\b/iu.test(
        sql.slice(0, audit.start),
      ),
      false,
    );
  }
  assert.equal(auditBodies[0], auditBodies[1]);
});

test("each deploy phase rejects a wrong receipt-owner mapping", () => {
  for (const [name, sql] of [
    ["pre", preMigrationSql],
    ["post", postMigrationSql],
  ]) {
    const audit = receiptOwnerAudit(sql).body;
    for (const table of receiptTables) {
      const wrongMapping = audit.replace(
        `'${table}'::NAME,\n        '${ownerRole}'::NAME`,
        `'${table}'::NAME,\n        'social_monitor_reader_summary_publication_owner'::NAME`,
      );
      assert.notEqual(wrongMapping, audit, `${name} ${table}`);
      assert.equal(
        hasExactReceiptOwnerMapping(wrongMapping),
        false,
        `${name} ${table}`,
      );
    }
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
