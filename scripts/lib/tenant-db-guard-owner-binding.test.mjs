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

test("PostgreSQL escape strings cannot smuggle executable role changes", () => {
  const sql = `SELECT E'a\\'; SET ROLE ${ownerRole}; SELECT E\\'b';
CREATE TABLE public.receipt (id uuid);`;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("set_config cannot enable PostgreSQL string-lexing role smuggling", () => {
  const sql = String.raw`SELECT pg_catalog.set_config('standard_conforming_strings', 'off', false);
SELECT 'a\'; SET ROLE social_monitor_public_schema_owner; SELECT \'b';
CREATE TABLE public.receipt (id uuid);`;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("executable set_config identifier variants fail closed", () => {
  for (const expression of [
    "set_config('standard_conforming_strings', 'off', false)",
    "SeT_CoNfIg('standard_conforming_strings', 'off', false)",
    "pg_catalog.set_config('standard_conforming_strings', 'off', false)",
    'pg_catalog."set_config"(\'standard_conforming_strings\', \'off\', false)',
    '"pg_catalog"."SET_CONFIG"(\'standard_conforming_strings\', \'off\', false)',
  ]) {
    const sql = `SET ROLE "${ownerRole}";
      SELECT ${expression};
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      expression,
    );
  }
});

test("string, comment, and nested dollar-quoted set_config decoys stay harmless", () => {
  const sql = `
    SELECT 'set_config', 'pg_catalog.set_config()', '"set_config"';
    -- SELECT set_config('standard_conforming_strings', 'off', false);
    /* SELECT pg_catalog."set_config"('standard_conforming_strings', 'off', false); */
    DO $outer$ BEGIN
      -- PERFORM set_config('role', 'wrong_owner', false);
      /* PERFORM pg_catalog."set_config"('role', 'wrong_owner', false); */
      PERFORM 'set_config', E'pg_catalog.set_config()';
      PERFORM $inner$ SELECT pg_catalog.set_config(
        'standard_conforming_strings', 'off', false
      ) $inner$;
    END $outer$;
    SET ROLE "${ownerRole}";
    CREATE TABLE public.receipt (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("DO set_config cannot enable a generic-string owner spoof", () => {
  const sql = String.raw`
    DO $body$ BEGIN
      PERFORM pg_catalog.set_config('standard_conforming_strings', 'off', false);
      PERFORM 'a\'; SET ROLE social_monitor_public_schema_owner; PERFORM \'b';
    END $body$;
    CREATE TABLE public.receipt (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    false,
  );
});

test("quoted, schema-qualified, and cased set_config in DO fails closed", () => {
  for (const expression of [
    '"SeT_CoNfIg"(\'role\', \'social_monitor_public_schema_owner\', false)',
    'pg_catalog."SET_CONFIG"(\'role\', \'social_monitor_public_schema_owner\', false)',
    '"pg_catalog".SeT_CoNfIg(\'role\', \'social_monitor_public_schema_owner\', false)',
  ]) {
    const sql = `DO $body$ BEGIN PERFORM ${expression}; END $body$;
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      expression,
    );
  }
});

test("CREATE FUNCTION set_config body is inert until invoked", () => {
  const sql = `
    CREATE FUNCTION public.configure_owner() RETURNS void AS $function$
    BEGIN
      PERFORM pg_catalog.set_config('role', '${ownerRole}', false);
    END
    $function$ LANGUAGE plpgsql;
    SET ROLE "${ownerRole}";
    CREATE TABLE public.receipt (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("top-level CALL and prepared EXECUTE fail closed", () => {
  for (const statement of [
    "CALL public.configure_owner();",
    "EXECUTE configure_owner;",
  ]) {
    const sql = `${statement}
      SET ROLE "${ownerRole}";
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      false,
      statement,
    );
  }
});

test("CREATE TRIGGER EXECUTE FUNCTION is not a top-level EXECUTE command", () => {
  const sql = `
    CREATE TRIGGER receipt_trigger BEFORE INSERT ON public.other_receipt
      EXECUTE FUNCTION public.audit_receipt();
    SET ROLE "${ownerRole}";
    CREATE TABLE public.receipt (id uuid);
  `;
  assert.equal(
    migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
    true,
  );
});

test("PostgreSQL escape strings consume escapes and doubled quotes in either casing", () => {
  for (const escapeString of [
    String.raw`E'a\'; SET ROLE wrong_owner; SELECT \'b'`,
    String.raw`e'a\\b''; RESET ROLE; SELECT ''c'`,
  ]) {
    const sql = `SET ROLE "${ownerRole}";
      SELECT ${escapeString};
      CREATE TABLE public.receipt (id uuid);`;
    assert.equal(
      migrationBindsTableOwner({ sql, table: "receipt", ownerRole }),
      true,
      escapeString,
    );
  }
});

test("string lexing configuration changes fail closed", () => {
  for (const statement of [
    "SET standard_conforming_strings = off;",
    "SET LOCAL STANDARD_CONFORMING_STRINGS TO on;",
    'SET "backslash_quote" TO on;',
    "RESET standard_conforming_strings;",
    "RESET ALL;",
    "DISCARD ALL;",
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

test("malformed lexical input fails closed", () => {
  for (const malformed of [
    "SELECT 'unterminated",
    'SELECT "unterminated',
    "/* unterminated",
    "$body$ unterminated",
    "$bad-tag$ malformed",
    "SELECT E'unterminated",
    "SELECT e'dangling\\\\",
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
