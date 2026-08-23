import { spawnSync } from "node:child_process";
import { Pool, type PoolClient, type QueryResult } from "pg";

const migration = "20260819120000_feed_promotion_keyset_snapshot_indexes";
const indexes = [
  "feed_items_workspace_published_keyset_idx",
  "feed_items_interest_published_keyset_idx",
  "feed_items_workspace_observed_keyset_idx",
  "feed_items_interest_observed_keyset_idx",
] as const;
const tableOwner = "social_monitor_public_schema_owner";

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl, min: 0, max: 2 });
  try {
    await verifyConcurrentMigrationSerialization(pool);
    run("verify", databaseUrl, true);
    run("recover", databaseUrl, true);

    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[0]}"`);
    run("recover", databaseUrl, true);
    run("verify", databaseUrl, true);

    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[1]}"`);
    await ownerQuery(pool, `CREATE INDEX CONCURRENTLY "${indexes[1]}" ON public.feed_items (id)`);
    run("recover", databaseUrl, true);

    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[2]}"`);
    await ownerQuery(pool, `CREATE UNIQUE INDEX CONCURRENTLY "${indexes[2]}"
      ON public.feed_items (status)`).then(() => {
        throw new Error("invalid-index fixture unexpectedly succeeded");
      }).catch(() => undefined);
    const invalid = await pool.query<{ readonly valid: boolean }>(`
      SELECT indisvalid AS valid FROM pg_index WHERE indexrelid=$1::regclass
    `, [`public.${indexes[2]}`]);
    assert(invalid.rows[0]?.valid === false, "native invalid index fixture was not created");
    run("recover", databaseUrl, true);

    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[0]}"`);
    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[3]}"`);
    await ownerQuery(pool, `CREATE INDEX CONCURRENTLY "${indexes[0]}" ON public.feed_items (id)`);
    run("recover", databaseUrl, true); // partial success
    run("recover", databaseUrl, true); // retry/all-valid

    const original = await pool.query(`SELECT * FROM _prisma_migrations WHERE migration_name=$1`, [migration]);
    assert(original.rowCount === 1, "promotion migration history row is missing");
    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[3]}"`);
    await pool.query(`UPDATE _prisma_migrations SET finished_at=NULL, rolled_back_at=NULL,
      started_at=clock_timestamp(), applied_steps_count=0, logs=$2
      WHERE migration_name=$1`, [migration,
      recognizedLog(indexes[3])]);
    assert(!run("recover", databaseUrl, false),
      "fresh or potentially running migration was automatically resolved");
    await pool.query(`UPDATE _prisma_migrations SET
      started_at=clock_timestamp() - interval '10 minutes'
      WHERE migration_name=$1`, [migration]);
    const recoveryLockClient = await pool.connect();
    await recoveryLockClient.query(
      "SELECT pg_advisory_lock(hashtextextended($1, 0))",
      [`social-monitor:${migration}`],
    );
    assert(!run("recover", databaseUrl, false),
      "concurrent recovery ignored the migration advisory lock");
    await recoveryLockClient.query(
      "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
      [`social-monitor:${migration}`],
    );
    recoveryLockClient.release();
    const activeClient = await pool.connect();
    const activeOperation = activeClient.query(
      `SELECT pg_sleep(5) /* ${migration} ${indexes[3]} */`,
    );
    assert(!run("recover", databaseUrl, false),
      "active migration operation was automatically resolved");
    await activeOperation;
    activeClient.release();
    await pool.query(`UPDATE _prisma_migrations SET
      logs='arbitrary synthetic failure' WHERE migration_name=$1`, [migration]);
    assert(!run("recover", databaseUrl, false),
      "arbitrary synthetic migration log was automatically resolved");
    await pool.query(`UPDATE _prisma_migrations SET
      applied_steps_count=1, logs=$2 WHERE migration_name=$1`, [migration,
      recognizedLog(indexes[3])]);
    assert(!run("recover", databaseUrl, false),
      "unknown partial applied-step state was automatically resolved");
    for (const logs of [
      recognizedLog("unrelated_feed_index"),
      `Migration ${migration} failed with P3018: database error code: 55P03; canceling statement due to lock timeout`,
      `Migration unrelated_migration failed with P3018 while CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexes[3]}" failed: database error code: 55P03; canceling statement due to lock timeout`,
      `Migration ${migration} failed with P3018 while CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexes[3]}" failed: database error code: 42P07; relation already exists`,
    ]) {
      await pool.query(`UPDATE _prisma_migrations SET applied_steps_count=0,
        logs=$2 WHERE migration_name=$1`, [migration, logs]);
      assert(!run("recover", databaseUrl, false),
        "non-allowlisted migration failure identity was automatically resolved");
    }
    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[1]}"`);
    await ownerQuery(pool, `CREATE INDEX CONCURRENTLY "${indexes[1]}"
      ON public.feed_items (id)`);
    await pool.query(`UPDATE _prisma_migrations SET logs=$2
      WHERE migration_name=$1`, [migration, recognizedLog(indexes[3])]);
    assert(!run("recover", databaseUrl, false),
      "mismatched earlier catalog index was automatically resolved");
    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[1]}"`);
    await ownerQuery(pool, `CREATE INDEX CONCURRENTLY "${indexes[1]}" ON public.feed_items
      (tenant_id, workspace_id, interest_id, published_at DESC, id DESC)
      WHERE status = 'VISIBLE'`);
    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[2]}"`);
    assert(!run("recover", databaseUrl, false),
      "partial four-index catalog progression was automatically resolved");
    await ownerQuery(pool, `CREATE INDEX CONCURRENTLY "${indexes[2]}" ON public.feed_items
      (tenant_id, workspace_id, observed_at DESC, id DESC)
      WHERE status = 'VISIBLE'`);
    await ownerQuery(pool, `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexes[3]}"
      ON public.feed_items (tenant_id, workspace_id, interest_id, observed_at DESC, id DESC)
      WHERE status = 'VISIBLE'`);
    await pool.query(`UPDATE _prisma_migrations SET logs=$2
      WHERE migration_name=$1`, [migration, recognizedLog(indexes[3])]);
    assert(!run("recover", databaseUrl, false),
      "recognized log with a completed catalog index was automatically resolved");
    await ownerQuery(pool, `DROP INDEX CONCURRENTLY public."${indexes[3]}"`);
    run("recover", databaseUrl, true);
    runCommand("node_modules/.bin/prisma", ["migrate", "deploy", "--schema", "prisma/schema.prisma"], {
      ...process.env, DATABASE_URL: databaseUrl,
    }, true);
    run("verify", databaseUrl, true);
    console.log("feed_promotion_index_recovery_postgres=ok scenarios=missing,invalid,mismatched,failed,unknown-log,unknown-index,unrelated-p3018,fresh,active,partial,catalog-complete,retry,skip,external-db,concurrent-serialization,recovery-lock-contention");
  } finally {
    await pool.end();
  }
}

const ownerQuery = async <TRow extends Record<string, unknown> = Record<string, unknown>>(
  pool: Pool,
  sql: string,
): Promise<QueryResult<TRow>> => {
  const client = await pool.connect();
  try {
    await assumeFeedItemsOwner(client);
    return await client.query<TRow>(sql);
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    client.release();
  }
};

const assumeFeedItemsOwner = async (client: PoolClient): Promise<void> => {
  const owner = await client.query<{
    readonly table_owner: string;
    readonly login_role: string;
  }>(`SELECT pg_get_userbyid(relowner) AS table_owner,
            session_user AS login_role
      FROM pg_class WHERE oid = 'public.feed_items'::regclass`);
  const actualOwner = owner.rows[0]?.table_owner;
  const loginRole = owner.rows[0]?.login_role;
  assert(actualOwner !== undefined &&
    (actualOwner === loginRole || actualOwner === tableOwner),
  `unexpected feed_items owner: ${actualOwner ?? "missing"}`);
  await client.query("SELECT set_config('role', $1, false)", [actualOwner]);
};

const recognizedLog = (indexName: string): string =>
  `Migration ${migration} failed with P3018 while CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" failed: database error code: 55P03; canceling statement due to lock timeout`;

const verifyConcurrentMigrationSerialization = async (pool: Pool): Promise<void> => {
  const first = await pool.connect();
  const second = await pool.connect();
  const key = "social-monitor:20260819120000_feed_promotion_keyset_snapshot_indexes";
  try {
    await first.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [key]);
    await second.query("SET statement_timeout = '100ms'");
    await second.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [key])
      .then(() => { throw new Error("concurrent migration lock unexpectedly succeeded"); })
      .catch((error: unknown) => {
        assert(errorCode(error) === "57014", "concurrent migration did not fail in finite time");
      });
    await first.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key]);
    await second.query("RESET statement_timeout");
    const acquired = await second.query<{ readonly acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [key],
    );
    assert(acquired.rows[0]?.acquired === true, "migration lock was not reusable after release");
    await second.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key]);
  } finally {
    first.release();
    second.release();
  }
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : undefined;

const run = (
  mode: "recover" | "verify",
  databaseUrl: string,
  expectedSuccess: boolean,
): boolean => runCommand("node_modules/.bin/ts-node", [
  "-r", "tsconfig-paths/register", "scripts/check-feed-promotion-index-recovery.ts", mode,
], {
  ...process.env,
  DATABASE_URL: databaseUrl,
}, expectedSuccess);

const runCommand = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  expectedSuccess: boolean,
): boolean => {
  const result = spawnSync(command, [...args], { env, encoding: "utf8" });
  const success = result.status === 0;
  if (success !== expectedSuccess) {
    throw new Error(`Unexpected ${command} status=${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return success;
};

const required = (name: string): string => {
  const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value;
};
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
