import { spawnSync } from "node:child_process";
import { Pool, type PoolClient } from "pg";

const MIGRATION = "20260819120000_feed_promotion_keyset_snapshot_indexes";
const TABLE_OWNER = "social_monitor_public_schema_owner";
const RECOVERY_LOCK = `social-monitor:${MIGRATION}`;
const FAILED_MIGRATION_MINIMUM_AGE_MS = 5 * 60 * 1_000;
type RecognizedFailure = {
  readonly indexName: string;
  readonly kind: "lock_timeout" | "statement_timeout";
};

const INDEXES = [
  index("feed_items_workspace_published_keyset_idx",
    ["tenant_id", "workspace_id", "published_at", "id"],
    [false, false, true, true]),
  index("feed_items_interest_published_keyset_idx",
    ["tenant_id", "workspace_id", "interest_id", "published_at", "id"],
    [false, false, false, true, true]),
  index("feed_items_workspace_observed_keyset_idx",
    ["tenant_id", "workspace_id", "observed_at", "id"],
    [false, false, true, true]),
  index("feed_items_interest_observed_keyset_idx",
    ["tenant_id", "workspace_id", "interest_id", "observed_at", "id"],
    [false, false, false, true, true]),
] as const;

type ExpectedIndex = (typeof INDEXES)[number];
type CatalogRow = {
  readonly name: string;
  readonly valid: boolean;
  readonly ready: boolean;
  readonly live: boolean;
  readonly unique_index: boolean;
  readonly predicate: string | null;
  readonly expression: string | null;
  readonly access_method: string;
  readonly key_count: number;
  readonly options: readonly string[] | null;
  readonly columns: string[];
  readonly descending: boolean[];
  readonly nulls_first: boolean[];
  readonly opclasses: string[];
};

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "recover";
  if (mode !== "recover" && mode !== "verify" && mode !== "inspect") {
    throw new Error("feed promotion index mode must be inspect, recover, or verify");
  }
  const pool = new Pool({
    connectionString: requiredEnvironment("DATABASE_URL"),
    min: 0,
    max: 1,
  });
  try {
    const client = await pool.connect();
    let recoveryLockHeld = false;
    try {
      if (mode === "recover") {
        recoveryLockHeld = await acquireRecoveryLock(client);
        if (!recoveryLockHeld) {
          throw new Error("Promotion migration recovery lock is already held");
        }
        await client.query("SET lock_timeout = '2s'");
        await client.query("SET statement_timeout = '15min'");
      }
      const state = await inspect(client);
      const pending = INDEXES.filter((expected) => !matches(state.get(expected.name), expected));
      if (mode === "inspect") {
        console.log(pending.length === 0
          ? "feed_promotion_indexes=all_valid"
          : `feed_promotion_indexes=pending count=${pending.length}`);
        return;
      }
      if (mode === "verify") {
        if (pending.length !== 0) {
          const details = pending.map((item) => ({
            expected: item,
            actual: state.get(item.name),
          }));
          throw new Error(`Promotion index verification failed: ${JSON.stringify(details)}`);
        }
        console.log("feed_promotion_indexes=verified count=4");
        return;
      }
      await resolveFailedMigration(client, state);
      if (pending.length === 0) {
        console.log("feed_promotion_index_recovery=skipped reason=all_valid");
        return;
      }
      await assumeFeedItemsOwner(client);
      try {
        for (const expected of pending) {
          if (state.has(expected.name)) {
            await client.query(`DROP INDEX CONCURRENTLY public."${expected.name}"`);
          }
        }
        for (const expected of pending) {
          await client.query(expected.createSql);
        }
      } finally {
        await client.query("RESET ROLE");
      }
      console.log(`feed_promotion_index_recovery=ok rebuilt=${pending.length}`);
    } finally {
      if (recoveryLockHeld) {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [RECOVERY_LOCK],
        );
      }
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const acquireRecoveryLock = async (client: PoolClient): Promise<boolean> => {
  const result = await client.query<{ readonly acquired: boolean }>(
    "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
    [RECOVERY_LOCK],
  );
  return result.rows[0]?.acquired === true;
};

const assumeFeedItemsOwner = async (client: PoolClient): Promise<void> => {
  const owner = await client.query<{
    readonly table_owner: string;
    readonly login_role: string;
  }>(`SELECT pg_get_userbyid(relowner) AS table_owner,
            session_user AS login_role
      FROM pg_class WHERE oid = 'public.feed_items'::regclass`);
  const tableOwner = owner.rows[0]?.table_owner;
  const loginRole = owner.rows[0]?.login_role;
  if (tableOwner === undefined ||
      (tableOwner !== loginRole && tableOwner !== TABLE_OWNER)) {
    throw new Error(`unexpected feed_items owner: ${tableOwner ?? "missing"}`);
  }
  await client.query("SELECT set_config('role', $1, false)", [tableOwner]);
};

const inspect = async (client: PoolClient): Promise<ReadonlyMap<string, CatalogRow>> => {
  const result = await client.query<CatalogRow>(`
    SELECT idx.relname AS name, i.indisvalid AS valid, i.indisready AS ready,
      i.indislive AS live, i.indisunique AS unique_index,
      am.amname AS access_method, i.indnkeyatts AS key_count,
      idx.reloptions AS options,
      pg_get_expr(i.indpred, i.indrelid) AS predicate,
      pg_get_expr(i.indexprs, i.indrelid) AS expression,
      ARRAY(SELECT att.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, ord)
        JOIN pg_attribute AS att ON att.attrelid = i.indrelid AND att.attnum = key.attnum
        ORDER BY key.ord)::text[] AS columns,
      ARRAY(SELECT (option & 1) = 1 FROM unnest(i.indoption) WITH ORDINALITY AS opt(option, ord)
        ORDER BY opt.ord) AS descending,
      ARRAY(SELECT (option & 2) = 2 FROM unnest(i.indoption) WITH ORDINALITY AS opt(option, ord)
        ORDER BY opt.ord) AS nulls_first,
      ARRAY(SELECT opc.opcname::text FROM unnest(i.indclass) WITH ORDINALITY AS cls(opcoid, ord)
        JOIN pg_opclass AS opc ON opc.oid = cls.opcoid ORDER BY cls.ord)::text[] AS opclasses
    FROM pg_index AS i
    JOIN pg_class AS idx ON idx.oid = i.indexrelid
    JOIN pg_class AS tbl ON tbl.oid = i.indrelid
    JOIN pg_am AS am ON am.oid = idx.relam
    JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public' AND tbl.relname = 'feed_items'
      AND idx.relname = ANY($1::text[])
  `, [INDEXES.map((item) => item.name)]);
  return new Map(result.rows.map((row) => [row.name, row]));
};

const matches = (actual: CatalogRow | undefined, expected: ExpectedIndex): boolean =>
  actual !== undefined && actual.valid && actual.ready && actual.live &&
  matchesDefinition(actual, expected);

const matchesDefinition = (
  actual: CatalogRow,
  expected: ExpectedIndex,
): boolean =>
  !actual.unique_index && isVisiblePredicate(actual.predicate) && actual.expression === null &&
  actual.access_method === "btree" && actual.key_count === expected.columns.length &&
  actual.options === null && equal(actual.columns, expected.columns) &&
  equal(actual.descending, expected.descending) &&
  equal(actual.nulls_first, expected.descending) &&
  equal(actual.opclasses, expected.opclasses);

const resolveFailedMigration = async (
  client: PoolClient,
  catalog: ReadonlyMap<string, CatalogRow>,
): Promise<void> => {
  const result = await client.query<{
    readonly id: string;
    readonly started_at: Date;
    readonly logs: string | null;
    readonly applied_steps_count: number;
    readonly age_ms: number;
    readonly active: boolean;
  }>(`
    SELECT migration.id::text, migration.started_at, migration.logs,
      migration.applied_steps_count,
      EXTRACT(EPOCH FROM (clock_timestamp() - migration.started_at)) * 1000 AS age_ms,
      EXISTS (
        SELECT 1 FROM pg_stat_progress_create_index progress
        JOIN pg_class index_class ON index_class.oid = progress.index_relid
        WHERE index_class.relname = ANY($2::text[])
      ) OR EXISTS (
        SELECT 1 FROM pg_stat_activity activity
        WHERE activity.pid <> pg_backend_pid()
          AND activity.state <> 'idle'
          AND (activity.query ILIKE '%20260819120000_feed_promotion_keyset_snapshot_indexes%'
            OR activity.query ILIKE ANY($3::text[]))
      ) AS active
    FROM public._prisma_migrations migration
    WHERE migration.migration_name = $1
      AND migration.finished_at IS NULL AND migration.rolled_back_at IS NULL
  `, [MIGRATION, INDEXES.map((item) => item.name),
    INDEXES.map((item) => `%${item.name}%`)]).catch((error: unknown) => {
    if (errorCode(error) === "42P01") return { rows: [] };
    throw error;
  });
  if (result.rows.length === 0) return;
  if (result.rows.length !== 1) {
    throw new Error("Promotion migration recovery found ambiguous history rows");
  }
  const failed = result.rows[0]!;
  if (failed.active || Number(failed.age_ms) < FAILED_MIGRATION_MINIMUM_AGE_MS) {
    throw new Error("Promotion migration is active or too recent to resolve safely");
  }
  const recognized = failed.logs === null
    ? undefined
    : recognizedFailure(failed.logs);
  const catalogIdentity = recognized?.indexName;
  if (failed.applied_steps_count !== 0 || recognized === undefined ||
      catalogIdentity === undefined ||
      !permittedCatalogProgression(catalog, catalogIdentity)) {
    throw new Error("Promotion migration failure state is not recognized for automatic recovery");
  }
  const command = spawnSync("node_modules/.bin/prisma", [
    "migrate", "resolve", "--rolled-back", MIGRATION, "--schema", "prisma/schema.prisma",
  ], { stdio: "inherit", env: process.env });
  if (command.status !== 0) throw new Error("Failed Prisma migration could not be resolved as rolled back");
};

const recognizedFailure = (logs: string): RecognizedFailure | undefined => {
  if (!logs.includes(MIGRATION) || !/\bP3018\b/u.test(logs)) return undefined;
  const kind = /database error code:\s*55P03\b/iu.test(logs) &&
      /canceling statement due to lock timeout/iu.test(logs)
    ? "lock_timeout" as const
    : /database error code:\s*57014\b/iu.test(logs) &&
        /canceling statement due to statement timeout/iu.test(logs)
      ? "statement_timeout" as const
      : undefined;
  if (kind === undefined) return undefined;
  for (const expected of INDEXES) {
    const escaped = escapeRegExp(expected.name);
    const exactSql = new RegExp(
      `CREATE\\s+INDEX\\s+CONCURRENTLY\\s+IF\\s+NOT\\s+EXISTS\\s+"${escaped}"`,
      "iu",
    );
    if (!exactSql.test(logs)) continue;
    return { indexName: expected.name, kind };
  }
  return undefined;
};

const permittedCatalogProgression = (
  catalog: ReadonlyMap<string, CatalogRow>,
  failedIndexName: string,
): boolean => {
  const failedAt = INDEXES.findIndex((item) => item.name === failedIndexName);
  if (failedAt < 0) return false;
  return INDEXES.every((expected, position) => {
    const actual = catalog.get(expected.name);
    if (position < failedAt) return matches(actual, expected);
    if (position > failedAt) return actual === undefined;
    return actual === undefined ||
      (matchesDefinition(actual, expected) &&
        (!actual.valid || !actual.ready || !actual.live));
  });
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function index(name: string, columns: readonly string[], descending: readonly boolean[]) {
  const columnSql = columns.map((column, position) =>
    `"${column}"${descending[position] === true ? " DESC" : ""}`).join(", ");
  const opclasses = columns.map((column) => column.endsWith("_at")
    ? "timestamptz_ops" : "uuid_ops");
  return { name, columns, descending, opclasses,
    createSql: `CREATE INDEX CONCURRENTLY "${name}" ON public."feed_items" (${columnSql}) WHERE "status" = 'VISIBLE'`,
  } as const;
}
const isVisiblePredicate = (predicate: string | null): boolean =>
  predicate !== null &&
  /^\(?status\s*=\s*'VISIBLE'::"FeedItemStatus"\)?$/u.test(predicate);
const equal = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : undefined;

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
