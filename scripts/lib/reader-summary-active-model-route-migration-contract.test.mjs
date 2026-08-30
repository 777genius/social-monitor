import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "prisma/migrations/20260829143000_reader_summary_active_model_route_authority/migration.sql";
const preBootstrapPath =
  "ops/deploy/reader-summary-publication-pre-migration.sql";
const postBootstrapPath =
  "ops/deploy/reader-summary-publication-post-migration.sql";
const routeAuthorityTable =
  "reader_summary_daily_canonical_recovery_v4_route_authorities";

const historicalMigrationDigests = Object.freeze({
  "prisma/migrations/20260802170000_reader_summary_weekly_review_manifest/migration.sql":
    "a6e77d075bf9f680f23732f0fb28f0d151078b87e6fda93dba748b6c3e3a70f2",
  "prisma/migrations/20260802233000_reader_summary_daily_canonical_recovery_v4/migration.sql":
    "135e3b402722145c1b8cc0a584924dbb11c8b14c5352a19d618ea158a5b24bad",
  "prisma/migrations/20260804110000_reader_summary_daily_v4_original_cutoff_forward_correction/migration.sql":
    "8000636562c896e41d1af2b892aef08862fc5f0e94741ec3ce07567f77016f4f",
  "prisma/migrations/20260806010100_reader_summary_daily_v4_canonical_output_receipt_v3/migration.sql":
    "0036e420dd561c54c5658428881a4ad38736a4e9268efb20bfdc6a956ce88be6",
});

const sql = readFileSync(migrationPath, "utf8");
const preBootstrapSql = readFileSync(preBootstrapPath, "utf8");
const postBootstrapSql = readFileSync(postBootstrapPath, "utf8");

test("historical plan and receipt migrations remain byte-identical", () => {
  for (const [path, expected] of Object.entries(historicalMigrationDigests)) {
    const digest = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
    assert.equal(digest, expected, path);
  }
});

test("the route authority is immutable and byte-addressed", () => {
  for (const marker of [
    "@social-monitor-forward-migration",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
    'CREATE TABLE public."reader_summary_daily_canonical_recovery_v4_route_authorities"',
    "reader_summary.daily_canonical_recovery_route_authority.v2",
    'public."reader_summary_weekly_canonical_json_unbounded"("canonical_record")',
    'btrim("canonical_sha256") = encode(sha256("canonical_bytes"), \'hex\')',
    "BEFORE UPDATE OR DELETE",
    "BEFORE TRUNCATE",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    'REVOKE ALL ON TABLE\n  public."reader_summary_daily_canonical_recovery_v4_route_authorities"',
  ]) {
    assert.ok(sql.includes(marker), marker);
  }
});

test("the route authority remains in every exact protected-owner inventory", () => {
  const quotedTable = `'${routeAuthorityTable}'`;
  assert.equal(preBootstrapSql.split(quotedTable).length - 1, 7);
  assert.equal(postBootstrapSql.split(quotedTable).length - 1, 3);
  for (const bootstrapSql of [preBootstrapSql, postBootstrapSql]) {
    assert.ok(bootstrapSql.includes("v_v4_table_count NOT IN (0, 3, 4, 5)"));
    assert.match(
      bootstrapSql,
      /v_owner_count <> 4 \+ v_weekly_review_manifest_table_count\s*\+ v_v4_table_count/u,
    );
  }
});

test("the frozen plan binds one exact superseding model contract", () => {
  for (const marker of [
    'public."rs_daily_v4_active_route_record"',
    'PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();',
    'v_first."canonical_record" IS DISTINCT FROM v_second."canonical_record"',
    'v_first."canonical_bytes" IS DISTINCT FROM v_second."canonical_bytes"',
    "v_first.\"canonical_record\"->'modelContract' IS DISTINCT FROM\n      c_legacy_contract",
    "'supersededModelContract', c_legacy_contract",
    "'modelContract', c_active_contract",
    "'purpose', 'social_monitor.reader_summary.daily.canonical_recovery.v2'",
    "'model', 'gpt-5.6-sol'",
    "'reasoningEffort', 'high'",
    "'selectedOutputKind', 'output_text'",
    'ON CONFLICT ("tenant_id", "workspace_id") DO NOTHING',
    'PERFORM public."assert_rs_daily_v4_active_route_authority"',
  ]) {
    assert.ok(sql.includes(marker), marker);
  }
});

test("claim and completion require the active route authority", () => {
  for (const marker of [
    "DO $bind_daily_v4_claim_to_active_route$",
    'PERFORM public."adopt_rs_daily_v4_active_route_authority"(\n    target_tenant_id, target_workspace_id',
    "DO $cut_daily_v4_completion_to_active_route$",
    'PERFORM public."assert_rs_daily_v4_active_route_authority"(\n    target_tenant_id, target_workspace_id',
    "v_attestation->>''reasoningEffort'' IS DISTINCT FROM ''high''",
    "RAISE EXCEPTION 'daily canonical recovery v4 completion preimage diverged'",
    "RAISE EXCEPTION 'daily canonical recovery v4 completion route rewrite failed'",
  ]) {
    assert.ok(sql.includes(marker), marker);
  }
});

test("historical V3 verification admits only exact paired identities", () => {
  for (const marker of [
    "DO $extend_daily_v4_v3_historical_receipt_verification$",
    "verify_reader_summary_daily_canonical_recovery_v4_provenance_v3",
    "record_reader_summary_daily_canonical_recovery_v4_evidence_v3",
    "'social_monitor.reader_summary.weekly.generate'\n       AND v_receipt->'attestation'->>'reasoningEffort' IS NOT DISTINCT FROM\n        'xhigh'",
    "'social_monitor.reader_summary.daily.canonical_recovery.v2'\n       AND v_receipt->'attestation'->>'reasoningEffort' IS NOT DISTINCT FROM\n        'high'",
    "RAISE EXCEPTION 'daily V4 V3 receipt verifier % preimage diverged'",
  ]) {
    assert.ok(sql.includes(marker), marker);
  }
});

test("new weekly review writes require review.v2 and high", () => {
  const weeklyCutover = sql.slice(
    sql.indexOf("DO $cut_weekly_review_new_writes_to_active_route$"),
    sql.indexOf("$cut_weekly_review_new_writes_to_active_route$;") +
      "$cut_weekly_review_new_writes_to_active_route$;".length,
  );
  for (const marker of [
    "DO $cut_weekly_review_new_writes_to_active_route$",
    "v_old_purpose_predicate CONSTANT TEXT",
    "v_new_purpose_predicate CONSTANT TEXT",
    "v_old_effort_predicate CONSTANT TEXT",
    "v_new_effort_predicate CONSTANT TEXT",
    "v_definition, v_old_purpose_predicate, v_new_purpose_predicate",
    "v_definition, v_old_effort_predicate, v_new_effort_predicate",
    "pg_catalog.strpos(v_definition, v_old_purpose_predicate) <> 0",
    "pg_catalog.strpos(v_definition, v_new_purpose_predicate) = 0",
    "RAISE EXCEPTION 'weekly review manifest active route preimage diverged'",
    "RAISE EXCEPTION 'weekly review manifest active route rewrite failed'",
  ]) {
    assert.ok(weeklyCutover.includes(marker), marker);
  }
  assert.ok(
    weeklyCutover.includes("'''social_monitor.reader_summary.weekly.review'''") &&
      weeklyCutover.includes(
        "'''social_monitor.reader_summary.weekly.review.v2'''",
      ),
    "purpose checks must include the closing quote so review is not mistaken " +
      "for the review.v2 prefix",
  );
  assert.doesNotMatch(
    weeklyCutover,
    /strpos\(v_definition, v_old_purpose\)/u,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\."reader_summary_weekly_review_manifests"/u,
  );
  assert.doesNotMatch(
    sql,
    /DELETE\s+FROM\s+public\."reader_summary_weekly_review_manifests"/u,
  );
});
