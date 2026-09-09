/** Instrumentation delegates every statement/transaction to native Prisma. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";

import { assertObserverTargets, readFixtureMarker, fixtureObserverRole, fixtureRuntimeRole } from "./reader-summary-successor-fixture-safety";
import { assertSubjectPrivileges, observerRelations } from "./reader-summary-successor-fixture-observer";
export const relations = observerRelations.map(name => `public.${name}`);
export const required = (key: string) => {
  const value = process.env[key];
  assert(value, `${key} required; native gate never skips`);
  return value;
};
export async function fixtureObserver() {
  const raw = required("READER_SUMMARY_REFRESH_TEST_DATABASE_URL");
  const observerUrl = required("READER_SUMMARY_REFRESH_TEST_OBSERVER_DATABASE_URL");
  const marker = readFixtureMarker(required("READER_SUMMARY_SUCCESSOR_CLUSTER_MARKER"));
  assertObserverTargets(raw, observerUrl, marker);
  const observer = new Client({ connectionString: observerUrl });
  try {
    await observer.connect();
    const result = await observer.query<{ directory: string; identifier: string; database: string }>(
      "select * from reader_summary_refresh_test_observer.identity()");
    assert.deepEqual(result.rows, [{ directory: marker.dataDirectory, identifier: marker.systemIdentifier, database: marker.database }]);
    // This temporary subject connection is closed before the max-two Prisma pool exists.
    const subject = new Client({ connectionString: raw });
    try {
      await subject.connect();
      const identity = await subject.query("select session_user, current_user");
      assert.deepEqual(identity.rows, [{ session_user: fixtureRuntimeRole, current_user: fixtureRuntimeRole }]);
      const live = await subject.query<{ pid: number; database: string }>(
        "select pg_backend_pid() as pid, current_database() as database");
      assert.equal(live.rows[0]?.database, marker.database);
      // The attested observer must see this live subject PID in the same database.
      // Matching endpoints plus this cross-connection observation binds system-id
      // without granting any cluster metadata capability to the subject.
      const seen = await observer.query("select pid, datname as database, usename as username from pg_catalog.pg_stat_activity where pid=$1",
        [live.rows[0]!.pid]);
      assert.deepEqual(seen.rows, [{ ...live.rows[0], username: fixtureRuntimeRole }]);
    } finally { await subject.end(); }
    assert.deepEqual((await observer.query("select session_user, current_user")).rows,
      [{ session_user: fixtureObserverRole, current_user: fixtureObserverRole }]);
    await assertSubjectPrivileges(observer);
    assert.deepEqual((await observer.query("select pg_has_role($1,$2,'MEMBER') as member",
      [fixtureRuntimeRole, fixtureObserverRole])).rows, [{ member: false }]);
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
    await assertUnlocked(observer);
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

/** A setup refusal is never a subject contention result. */
export async function assertObserverConflict(observer: Pick<Client, "query">, table: string,
  consume: () => Promise<unknown>): Promise<void> {
  assert(relations.includes(table), "unknown observer relation");
  await observer.query("begin");
  try {
    await observer.query(`lock table ${table} in row exclusive mode nowait`);
    await assert.rejects(consume(), lockConflict);
    await observer.query(`lock table ${relations.join(",")} in row exclusive mode nowait`);
  } finally { await observer.query("rollback"); }
}
