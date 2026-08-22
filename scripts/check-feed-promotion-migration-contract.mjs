import { readFileSync } from "node:fs";

const migrationPath =
  "prisma/migrations/20260819120000_feed_promotion_keyset_snapshot_indexes/migration.sql";
const migration = readFileSync(migrationPath, "utf8");
const migrationSql = withoutComments(migration);
const schema = readFileSync("prisma/schema.prisma", "utf8");
const workflow = readFileSync(".github/workflows/pull-request.yml", "utf8");
const deploy = readFileSync(
  "ops/deploy/reader-summary-publication-deploy-lib.sh",
  "utf8",
);
const recovery = readFileSync(
  "scripts/check-feed-promotion-index-recovery.ts",
  "utf8",
);
const nativeRepositoryCheck = readFileSync(
  "scripts/check-feed-promotion-keyset-plan-postgres.ts",
  "utf8",
);
const nativeRecoveryCheck = readFileSync(
  "scripts/check-feed-promotion-index-recovery-postgres.ts",
  "utf8",
);
const productionFixtureCheck = readFileSync(
  "scripts/check-reader-summary-publication-postgres.ts",
  "utf8",
);
const feedPromotionPostgres18Check = readFileSync(
  "scripts/check-feed-promotion-postgres18.ts",
  "utf8",
);
const expected = [
  "feed_items_workspace_published_keyset_idx",
  "feed_items_interest_published_keyset_idx",
  "feed_items_workspace_observed_keyset_idx",
  "feed_items_interest_observed_keyset_idx",
];
const violations = [];

if (/\b(?:BEGIN|COMMIT)\b/iu.test(withoutComments(migration))) {
  violations.push("concurrent index migration must not contain a transaction block");
}
if (/\b(?:ALTER\s+TABLE|BIGSERIAL|scan_revision)\b/iu.test(migration)) {
  violations.push("promotion migration must contain indexes only");
}
if (!migration.includes("SET lock_timeout = '2s'") ||
    !migration.includes("SET statement_timeout = '30s'") ||
    !migration.includes("SET statement_timeout = '15min'") ||
    migration.includes("statement_timeout = '0'") ||
    !migration.includes("pg_advisory_lock(hashtextextended(") ||
    !migration.includes("pg_advisory_unlock(hashtextextended(") ||
    migrationSql.indexOf("pg_advisory_lock") >
      migrationSql.indexOf("CREATE INDEX CONCURRENTLY") ||
    migrationSql.lastIndexOf("pg_advisory_unlock") <
      migrationSql.lastIndexOf("CREATE INDEX CONCURRENTLY")) {
  violations.push("promotion migration must have finite timeouts and ordered session serialization");
}
const ownerRole = "'social_monitor_public_schema_owner'";
const assumeOwner = "SELECT set_config(";
if (!migration.includes(ownerRole) ||
    !migration.includes("owner.table_owner = session_user") ||
    !migration.includes(assumeOwner) ||
    migrationSql.indexOf(assumeOwner) >
      migrationSql.indexOf("CREATE INDEX CONCURRENTLY") ||
    migrationSql.lastIndexOf("RESET ROLE") <
      migrationSql.lastIndexOf("CREATE INDEX CONCURRENTLY")) {
  violations.push("promotion migration must build indexes as the ordered-bootstrap table owner");
}
for (const index of expected) {
  const concurrent = new RegExp(
    `CREATE\\s+INDEX\\s+CONCURRENTLY\\s+IF\\s+NOT\\s+EXISTS\\s+"${index}"`,
    "iu",
  );
  if (!concurrent.test(migration)) {
    violations.push(`${index} must be created concurrently`);
  }
  if (!schema.includes(`map: "${index}"`)) {
    violations.push(`${index} must be represented in the Prisma schema`);
  }
}
if ((withoutComments(migration).match(
  /CREATE\s+INDEX\s+CONCURRENTLY/giu,
) ?? []).length !== 4) {
  violations.push("promotion migration must create exactly four query indexes");
}
if ((!workflow.includes("check:feed-promotion-keyset-plan-postgres") &&
     !workflow.includes("check:feed-promotion-postgres18")) ||
    !workflow.includes("postgres:18.4-alpine")) {
  violations.push("required PR CI must run the native PostgreSQL promotion plan gate");
}
if (!deploy.includes("check:feed-promotion-index-recovery -- inspect") ||
    !deploy.includes("check:feed-promotion-index-recovery -- recover") ||
    !deploy.includes("check:feed-promotion-index-recovery -- verify") ||
    deploy.includes("df -B1 -P \"$PGDATA\"") ||
    deploy.includes("FEED_PROMOTION_FILESYSTEM_EVIDENCE_FILE") ||
    deploy.includes("ps -q postgres")) {
  violations.push("external managed PostgreSQL deploy must not infer capacity from app-host or Compose filesystems");
}
if (!recovery.includes("assumeFeedItemsOwner(client)") ||
    !recovery.includes("session_user AS login_role") ||
    !recovery.includes("SELECT set_config('role', $1, false)") ||
    !recovery.includes('client.query("RESET ROLE")')) {
  violations.push("concurrent index recovery must use and release the protected table-owner role");
}
for (const index of expected) {
  if (!recovery.includes(`DROP INDEX CONCURRENTLY public."${index}`) &&
      !recovery.includes("DROP INDEX CONCURRENTLY public.")) {
    violations.push(`${index} must be protected by exact concurrent recovery`);
  }
}
if (!recovery.includes("migrate\", \"resolve\", \"--rolled-back\"") ||
    !recovery.includes("pg_stat_progress_create_index") ||
    !recovery.includes("recognizedFailure") ||
    !recovery.includes("FAILED_MIGRATION_MINIMUM_AGE_MS") ||
    !workflow.includes("npm run check:feed-promotion-postgres18") ||
    !workflow.includes("PrismaFeedItemReadRepository") &&
      !workflow.includes("check:feed-promotion-keyset-plan-postgres") &&
      !workflow.includes("check:feed-promotion-postgres18")) {
  violations.push("migration recovery and required PostgreSQL CI production lifecycle are incomplete");
}
if (!nativeRepositoryCheck.includes("PrismaFeedConnection.create") ||
    !nativeRepositoryCheck.includes("new PrismaFeedItemReadRepository") ||
    !nativeRepositoryCheck.includes("readPromotionSnapshot") ||
    !nativeRepositoryCheck.includes('"published_at"') ||
    !nativeRepositoryCheck.includes('"observed_at"') ||
    !nativeRepositoryCheck.includes("99_999") ||
    !nativeRepositoryCheck.includes("100_000") ||
    !nativeRepositoryCheck.includes("100_001") ||
    !nativeRepositoryCheck.includes("1_001") ||
    !nativeRepositoryCheck.includes("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)") ||
    /CREATE\s+TABLE/iu.test(nativeRepositoryCheck)) {
  violations.push("native PostgreSQL CI must exercise the generated production repository without a fake schema");
}
if (!feedPromotionPostgres18Check.includes('"feed-promotion"') ||
    !productionFixtureCheck.includes("assertFeedPromotionOwnerOrder") ||
    !productionFixtureCheck.includes("social_monitor_public_schema_owner") ||
    !productionFixtureCheck.includes("check:feed-promotion-keyset-plan-postgres") ||
    !productionFixtureCheck.includes("check:feed-promotion-index-recovery-postgres")) {
  violations.push("native PostgreSQL CI must follow the ordered production ownership transition");
}
for (const scenario of [
  "missing", "invalid", "mismatched", "failed", "unknown-log",
  "unknown-index", "unrelated-p3018", "fresh", "active", "partial",
  "catalog-complete", "retry", "skip", "external-db",
  "concurrent-serialization",
  "recovery-lock-contention",
]) {
  if (!nativeRecoveryCheck.includes(scenario)) {
    violations.push(`native concurrent-index recovery is missing ${scenario} coverage`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Feed promotion migration contract OK");

function withoutComments(sql) {
  return sql.replace(/^\s*--.*$/gmu, "");
}
