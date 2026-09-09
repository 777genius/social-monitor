/** Instrumentation delegates every statement/transaction to native Prisma. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";

export const relations = ["source_item_engagement_snapshots", "source_items", "feed_items",
  "source_item_engagement_observations", "source_item_engagement_daily_rollups", "source_bindings",
  "interests", "source_catalog_entries", "reader_summary_policies", "reader_summary_jobs",
  "reader_summary_artifacts", "reader_summary_publications", "reader_summary_publication_slots",
  "reader_summary_new_input_refresh_reconciliations"];
export const required = (key: string) => {
  const value = process.env[key];
  assert(value, `${key} required; native gate never skips`);
  return value;
};
export async function fixtureObserver() {
  const raw = required("READER_SUMMARY_REFRESH_TEST_DATABASE_URL"), url = new URL(raw);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.port, /^\d+$/u);
  assert(Number(url.port) >= 1024);
  assert.equal(url.search, ""); assert.equal(url.hash, "");
  assert.match(url.pathname, /^\/reader_summary_refresh_test_[a-z0-9]+$/u);
  assert.equal(url.username, "reader_summary_refresh_test_runtime");
  assert.equal(url.password, "");
  const marker = JSON.parse(readFileSync(required("READER_SUMMARY_SUCCESSOR_CLUSTER_MARKER"), "utf8")) as {
    database: string; dataDirectory: string; port: number; systemIdentifier: string;
  };
  assert.equal(marker.database, url.pathname.slice(1)); assert.equal(String(marker.port), url.port);
  assert.match(marker.dataDirectory, /^\/tmp\/reader_summary_refresh_test_[a-zA-Z0-9]+\/data$/u);
  const observer = new Client({ connectionString: raw });
  await observer.connect();
  try {
    const result = await observer.query<{ directory: string; identifier: string; database: string }>(
      "select current_setting('data_directory') as directory, system_identifier::text as identifier, current_database() as database from pg_control_system()");
    assert.deepEqual(result.rows, [{ directory: marker.dataDirectory, identifier: marker.systemIdentifier, database: marker.database }]);
    const role = await observer.query("select rolsuper, rolbypassrls from pg_roles where rolname=current_user");
    assert.deepEqual(role.rows, [{ rolsuper: false, rolbypassrls: false }]);
    const pending = await observer.query<{ count: number }>(
      "select count(*)::int as count from _prisma_migrations where finished_at is null and rolled_back_at is null");
    assert.equal(pending.rows[0]?.count, 0, "fixture must have no unfinished migration");
    const migrations = await observer.query<{ migration_name: string; checksum: string }>(
      "select migration_name, checksum from _prisma_migrations where finished_at is not null and rolled_back_at is null order by migration_name");
    const names = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    assert.deepEqual(migrations.rows.map((row) => row.migration_name), names, "fixture must include every current migration exactly once");
    for (const row of migrations.rows) assert.equal(row.checksum,
      createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"));
    return { observer, url: raw };
  } catch (error) { await observer.end(); throw error; }
}
export function sqlState(error: unknown): string | undefined {
  const e = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
  return e.meta?.driverAdapterError?.cause?.originalCode ?? e.meta?.code ?? e.code;
}
export const lockConflict = (error: unknown) => sqlState(error) === "55P03";
export const poolTimeout = (error: unknown) => sqlState(error) === "P2028" &&
  error instanceof Error && /Unable to start a transaction in the given time/.test(error.message);
export type Connection = Pick<PrismaSummaryConnection, "$transaction">;
export function instrument(summary: Connection, hook: (tx: PrismaReaderSummaryClient, ordinal: number,
  sql: string, phase: "before" | "after") => Promise<void>): Connection {
  let ordinal = 0;
  return { $transaction: (work, options) => {
    const index = ++ordinal;
    return summary.$transaction(async (tx) => {
      await hook(tx, index, "BEGIN", "after");
      const proxy = new Proxy(tx, { get(target, key) {
        const method = Reflect.get(target, key) as unknown;
        if ((key === "$queryRaw" || key === "$executeRaw") && typeof method === "function") {
          return async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join(" ? ");
            await hook(tx, index, sql, "before");
            const result: unknown = await method.call(target, strings, ...values);
            await hook(tx, index, sql, "after");
            return result;
          };
        }
        return typeof method === "function" ? method.bind(target) : method;
      } });
      return work(proxy);
    }, options);
  } };
}
export async function assertUnlocked(observer: Client) {
  await observer.query("begin");
  try { await observer.query(`lock table ${relations.join(",")} in row exclusive mode nowait`); }
  finally { await observer.query("rollback"); }
}
