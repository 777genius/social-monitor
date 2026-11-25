import assert from "node:assert/strict";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

export const fixtureObserverRole = "reader_summary_refresh_test_observer";
export const fixtureRuntimeRole = "reader_summary_refresh_test_runtime";
export const fixtureMigrationRole = "reader_summary_refresh_test_migrator";
export type FixtureMarker = {
  format: "reader-summary-successor-disposable-cluster-v1";
  disposable: true;
  database: string;
  dataDirectory: string;
  socketDirectory: string;
  port: number;
  systemIdentifier: string;
};
export function assertFixtureTarget(raw: string, marker: FixtureMarker): URL {
  const url = new URL(raw);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "localhost"); // libpq/pg both use the explicit socket below.
  assert.equal(url.password, "");
  assert.equal(url.hash, "");
  assert.match(url.username, /^[a-z_][a-z0-9_]{0,62}$/u);
  assert.match(url.pathname, /^\/reader_summary_refresh_test_[a-z0-9]+$/u);
  assert.equal(marker.format, "reader-summary-successor-disposable-cluster-v1");
  assert.equal(marker.disposable, true);
  assert.equal(marker.database, url.pathname.slice(1));
  assert(Number.isInteger(marker.port) && marker.port >= 1024 && marker.port <= 65535);
  assert.equal(url.port, String(marker.port));
  assert.match(marker.systemIdentifier, /^\d+$/u);
  for (const path of [marker.dataDirectory, marker.socketDirectory]) {
    assert.equal(resolve(path), path);
    assert(!["/", "/tmp", "/var/run/postgresql"].includes(path));
  }
  assert.deepEqual([...url.searchParams.keys()], ["host"]);
  assert.equal(url.searchParams.get("host"), marker.socketDirectory);
  return url;
}
export function readFixtureMarker(path: string): FixtureMarker {
  const absolute = resolve(path), stat = lstatSync(absolute);
  assert.equal(realpathSync(absolute), absolute);
  assert(stat.isFile() && stat.nlink === 1 && (stat.mode & 0o222) === 0);
  assert(stat.size < 4096);
  return JSON.parse(readFileSync(absolute, "utf8")) as FixtureMarker;
}
export async function attestEmptyFixture(admin: Pool, marker: FixtureMarker): Promise<void> {
  const live = await admin.query(`select current_database() as database,
    current_setting('data_directory') as directory,
    current_setting('unix_socket_directories') as socket,
    current_setting('listen_addresses') as tcp,
    current_setting('port') as port, system_identifier::text as identifier
    from pg_control_system()`);
  assert.deepEqual(live.rows, [{ database: marker.database, directory: marker.dataDirectory,
    socket: marker.socketDirectory, tcp: "", port: String(marker.port), identifier: marker.systemIdentifier }]);
  const role = await admin.query("select rolsuper from pg_roles where rolname=current_user");
  assert.equal(role.rows[0]?.rolsuper, true, "fixture bootstrap requires the disposable cluster admin");
  const relations = await admin.query(`select n.nspname, c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast'`);
  assert.equal(relations.rowCount, 0, "refusing a nonempty database");
  const databases = await admin.query<{ datname: string }>("select datname from pg_database where not datistemplate");
  assert(databases.rows.every(({ datname }) => datname === "postgres" || /^reader_summary_refresh_test_[a-z0-9]+$/u.test(datname)),
    "cluster contains a database outside the disposable fixture namespace");
  const sessions = await admin.query("select pid from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()");
  assert.equal(sessions.rowCount, 0, "fixture database must have exclusive operator use");
}
export function fixtureRoleUrl(url: URL, role: string): string {
  const copy = new URL(url); copy.username = role; return copy.toString();
}

/** Both operator socket markers and the original native loopback marker are supported. */
export function assertObserverTargets(subject: string, observer: string, marker: FixtureMarker): void {
  const urls = [new URL(subject), new URL(observer)];
  for (const url of urls) {
    if (url.hostname === "localhost") assertFixtureTarget(url.toString(), marker);
    else {
      assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
      assert.equal(url.password, ""); assert.equal(url.search, ""); assert.equal(url.hash, "");
      assert.match(url.pathname, /^\/reader_summary_refresh_test_[a-z0-9]+$/u);
      assert.equal(url.pathname.slice(1), marker.database);
      assert(Number.isInteger(marker.port) && marker.port >= 1024 && marker.port <= 65535);
      assert.equal(url.port, String(marker.port));
      assert.match(marker.dataDirectory, /^\/tmp\/reader_summary_refresh_test_[a-zA-Z0-9]+\/data$/u);
      assert.match(marker.systemIdentifier, /^\d+$/u);
    }
  }
  assert.equal(urls[0]!.username, fixtureRuntimeRole);
  assert.equal(urls[1]!.username, fixtureObserverRole);
  urls[1]!.username = fixtureRuntimeRole;
  assert.equal(urls[0]!.toString(), urls[1]!.toString(), "observer and subject endpoints must match");
}
