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

test("an overriding transaction-scoped SET ROLE cannot bless creation", () => {
  const sql = `
    SET LOCAL ROLE "${ownerRole}";
    SET ROLE "social_monitor_reader_summary_publication_owner";
    CREATE TABLE public."receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

for (const statement of [
  "SET ROLE",
  "SET LOCAL ROLE",
  "SET SESSION ROLE",
]) {
  test(`${statement} can bind creation to the owner`, () => {
    const sql = `
      ${statement} "${ownerRole}";
      CREATE TABLE public."receipt" (id uuid);
    `;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      true,
    );
  });
}

test("unrecognized role-changing syntax fails closed", () => {
  const sql = `
    SET LOCAL ROLE "${ownerRole}";
    SET SESSION AUTHORIZATION "social_monitor_reader_summary_publication_owner";
    CREATE TABLE public."receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("ambiguous RESET SESSION AUTHORIZATION fails closed", () => {
  const sql = `
    SET LOCAL ROLE "${ownerRole}";
    RESET SESSION AUTHORIZATION;
    CREATE TABLE public."receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("RESET ROLE clears a preceding owner binding", () => {
  const sql = `
    SET SESSION ROLE "${ownerRole}";
    RESET ROLE;
    CREATE TABLE public."receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("comments and whitespace may separate every legal role token", () => {
  const sql = `
    SET/* command */LOCAL\n-- scope separator
      ROLE/* role separator */"${ownerRole}";
    CREATE/* create separator */TABLE public./* name separator */"receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("line and block comment role decoys do not change executable role state", () => {
  const sql = `
    SET ROLE "${ownerRole}";
    -- SET ROLE "social_monitor_reader_summary_publication_owner";
    /* RESET ROLE; SET SESSION AUTHORIZATION wrong_owner; */
    CREATE TABLE public."receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("quoted and dollar-quoted role decoys are not executable", () => {
  const sql = `
    SELECT 'RESET ROLE; SET ROLE ''wrong_owner'';';
    SELECT "SET ROLE wrong_owner";
    DO $decoy$ BEGIN
      SET ROLE wrong_owner;
      CREATE TABLE public.receipt (id uuid);
    END $decoy$;
    SET SESSION ROLE "${ownerRole}";
    CREATE TABLE public."receipt" (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

for (const prefix of ["E", "e"]) {
  test(`${prefix}-string escapes and doubled quotes cannot expose an owner-role decoy`, () => {
    const sql = String.raw`SET ROLE wrong_owner;
      SELECT ${prefix}'''\'; SET ROLE social_monitor_public_schema_owner; SELECT \'';
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
    );
  });

  test(`${prefix}-string wrong-role decoys stay inert under the expected role`, () => {
    const sql = String.raw`SET ROLE social_monitor_public_schema_owner;
      SELECT ${prefix}'''\'; SET ROLE wrong_owner; SELECT \'';
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      true,
    );
  });
}

test("valid Unicode, bit, and hex strings do not affect owner binding", () => {
  for (const literal of [
    String.raw`U&'SET ROLE wrong_owner; \0061'`,
    "B'101001'",
    "b'010110'",
    "X'cafe'",
    "x'BEEF'",
  ]) {
    const sql = `SET ROLE "${ownerRole}"; SELECT ${literal};
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      true,
      literal,
    );
  }
});

test("a valid Unicode-string owner-role decoy is not executable", () => {
  const sql = String.raw`SET ROLE wrong_owner;
    SELECT U&'SET ROLE social_monitor_public_schema_owner; \0061';
    CREATE TABLE public.receipt (id uuid);`;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("malformed or unsupported prefixed quoting fails closed", () => {
  for (const literal of [
    String.raw`E'unterminated\'`,
    String.raw`U&'bad \escape'`,
    String.raw`U&"unsupported identifier"`,
    String.raw`U&'alternate !0061' UESCAPE '!'`,
    "B'10201'",
    "X'not_hex'",
  ]) {
    const sql = `SET ROLE "${ownerRole}"; SELECT ${literal};
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      literal,
    );
  }
});

test("comment-interleaved wrong role and session authorization fail closed", () => {
  for (const statement of [
    "SET/**/ROLE wrong_owner;",
    "SET/* gap */SESSION/* gap */AUTHORIZATION wrong_owner;",
    "RESET/* gap */SESSION/* gap */AUTHORIZATION;",
  ]) {
    const sql = `SET LOCAL ROLE "${ownerRole}"; ${statement}
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      statement,
    );
  }
});

test("every executable SESSION AUTHORIZATION form fails closed", () => {
  for (const statement of [
    "SET SESSION AUTHORIZATION wrong_owner;",
    "SET/**/SESSION/**/AUTHORIZATION wrong_owner;",
    "SET LOCAL SESSION AUTHORIZATION wrong_owner;",
    "SET/**/LOCAL/**/SESSION/**/AUTHORIZATION wrong_owner;",
    "SET SESSION SESSION AUTHORIZATION wrong_owner;",
    "SET/**/SESSION/**/SESSION/**/AUTHORIZATION wrong_owner;",
  ]) {
    const sql = `SET ROLE "${ownerRole}"; ${statement}
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      statement,
    );
  }
});

test("malformed lexical input fails closed", () => {
  for (const malformed of [
    "SELECT 'unterminated",
    'SELECT "unterminated',
    "/* unterminated",
    "$body$ unterminated",
    "$bad-tag$ malformed",
  ]) {
    const sql = `SET ROLE "${ownerRole}"; ${malformed}
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      malformed,
    );
  }
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

test("a generic ALTER TABLE cannot establish owner binding", () => {
  const sql = `
    SET ROLE "${ownerRole}";
    ALTER TABLE public.receipt ADD COLUMN note text;
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("an ALTER-only explicit OWNER TO can establish owner binding", () => {
  const sql = `
    ALTER TABLE public.receipt OWNER TO "${ownerRole}";
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("a generic ALTER TABLE preserves a binding established by creation", () => {
  const sql = `
    SET ROLE "${ownerRole}";
    CREATE TABLE public.receipt (id uuid);
    ALTER TABLE public.receipt ADD COLUMN note text;
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("a later wrong ALTER OWNER invalidates an ALTER-only owner binding", () => {
  const sql = `
    ALTER TABLE public.receipt OWNER TO "${ownerRole}";
    ALTER TABLE public.receipt OWNER TO wrong_owner;
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("nested comments and transaction-local role reset retain their semantics", () => {
  const sql = `
    SET SESSION ROLE "${ownerRole}";
    SET LOCAL ROLE wrong_owner;
    /* outer /* SET ROLE wrong_owner; */ still outer */
    COMMIT;
    CREATE TABLE public.receipt (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("transaction completion clears an owner role that was only local", () => {
  for (const completion of ["COMMIT", "ROLLBACK"]) {
    const sql = `
      SET LOCAL ROLE "${ownerRole}";
      ${completion};
      CREATE TABLE public.receipt (id uuid);
    `;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      completion,
    );
  }
});

test("owner operations require the exact public table name", () => {
  const sql = `
    ALTER TABLE public.receipt_archive OWNER TO "${ownerRole}";
    ALTER TABLE private.receipt OWNER TO "${ownerRole}";
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
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
    assert.ok(audit.body.includes("relation.relkind <> expected.relation_kind"));
    assert.equal(audit.body.split("'r'::\"char\"").length - 1, 2);
    assert.ok(audit.body.includes("owner.rolname <> expected.owner_name"));
    assert.ok(audit.body.includes(") NOT IN (0, 2) OR EXISTS ("));
    assert.ok(audit.body.includes("relation.relname = ANY (ARRAY["));
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
