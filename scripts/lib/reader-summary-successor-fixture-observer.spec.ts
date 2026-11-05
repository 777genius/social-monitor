import { readFileSync } from "node:fs";
import type { Client, Pool } from "pg";
import { assertObserverTargets, fixtureRoleUrl, fixtureObserverRole, fixtureRuntimeRole, type FixtureMarker } from "./reader-summary-successor-fixture-safety";
import { provisionSuccessorObserver } from "./reader-summary-successor-fixture-observer";
import { assertObserverConflict, relations } from "./reader-summary-successor-native-support";

const marker: FixtureMarker = { format: "reader-summary-successor-disposable-cluster-v1", disposable: true,
  database: "reader_summary_refresh_test_unit", dataDirectory: "/tmp/reader_summary_refresh_test_unit/data",
  socketDirectory: "/tmp/reader_summary_refresh_test_unit/socket", port: 55432, systemIdentifier: "12345" };
const subject = `postgresql://${fixtureRuntimeRole}@localhost:55432/${marker.database}?host=${encodeURIComponent(marker.socketDirectory)}`;
const observer = fixtureRoleUrl(new URL(subject), fixtureObserverRole);

describe("separate disposable successor observer", () => {
  it("accepts exact socket receipts and legacy native loopback markers", () => {
    expect(() => assertObserverTargets(subject, observer, marker)).not.toThrow();
    const tcp = subject.replace("localhost", "127.0.0.1").split("?")[0]!;
    expect(() => assertObserverTargets(tcp, fixtureRoleUrl(new URL(tcp), fixtureObserverRole), marker)).not.toThrow();
  });
  it.each([subject, observer.replace("55432", "55433"), observer.replace("localhost", "example.com"),
    observer.replace(`${fixtureObserverRole}@`, `${fixtureObserverRole}:fabricated@`), `${observer}&options=x`])(
    "rejects mismatched identity, endpoint or credentials", value => {
      expect(() => assertObserverTargets(subject, value, marker)).toThrow();
    });
  it("rejects mismatched marker and same observer identity on subject", () => {
    expect(() => assertObserverTargets(subject, observer, { ...marker, systemIdentifier: "invalid" })).toThrow();
    expect(() => assertObserverTargets(observer, observer, marker)).toThrow();
    expect(() => assertObserverTargets(subject, observer, { ...marker, disposable: false } as unknown as FixtureMarker)).toThrow();
  });
  it.each(relations)("requires setup then subject 55P03 and cleanup for %s", async table => {
    const calls: string[] = [];
    const query = jest.fn(async (sql: string) => { calls.push(sql); return { rows: [] }; });
    const consume = jest.fn(async () => { calls.push("subject"); throw { code: "55P03" }; });
    await assertObserverConflict({ query } as unknown as Pick<Client, "query">, table, consume);
    expect(calls).toEqual(["begin", `lock table ${table} in row exclusive mode nowait`, "subject",
      `lock table ${relations.join(",")} in row exclusive mode nowait`, "rollback"]);
    expect(new Set(relations).size).toBe(14);
  });
  it.each(["42501", "55P03", "42P01"])("fails setup %s without invoking the subject", async code => {
    const query = jest.fn(async (sql: string) => { if (sql.startsWith("lock")) throw { code }; });
    const consume = jest.fn();
    await expect(assertObserverConflict({ query } as unknown as Pick<Client, "query">, relations[0]!, consume)).rejects.toEqual({ code });
    expect(consume).not.toHaveBeenCalled(); expect(query).toHaveBeenLastCalledWith("rollback");
  });
  it.each(["42501", "42P01", "57014"])("rejects subject %s as contention", async code => {
    const query = jest.fn(async () => ({ rows: [] }));
    await expect(assertObserverConflict({ query } as unknown as Pick<Client, "query">, relations[0]!,
      async () => { throw { code }; })).rejects.toThrow();
    expect(query).toHaveBeenLastCalledWith("rollback");
  });
  it("fails release probes and rolls back even after valid contention", async () => {
    const query = jest.fn(async (sql: string) => { if (sql.includes(",")) throw { code: "42501" }; });
    await expect(assertObserverConflict({ query } as unknown as Pick<Client, "query">, relations[0]!,
      async () => { throw { code: "55P03" }; })).rejects.toEqual({ code: "42501" });
    expect(query).toHaveBeenLastCalledWith("rollback");
  });
  it.each([false, true])("provisions atomically and fails closed on post-grant subject drift (%s)", async drift => {
    let audits = 0;
    const query = jest.fn(async (sql: string) => {
      if (sql.startsWith("select rolsuper")) return { rows: [{ rolsuper: drift && ++audits === 2,
        rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false,
        schema_owner: false, publication_owner: false, owns_relation: false, owns_database: false,
        ledger_write: false, slot_write: false }] };
      if (sql.startsWith("select pg_has_role")) return { rows: [{ member: false }] };
      return { rows: [] };
    });
    const release = jest.fn();
    const admin = { query, connect: async () => ({ query, release }) } as unknown as Pool;
    if (drift) await expect(provisionSuccessorObserver(admin)).rejects.toThrow();
    else await provisionSuccessorObserver(admin);
    expect(query).toHaveBeenLastCalledWith(drift ? "ROLLBACK" : "COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
    const grant = query.mock.calls.find(([sql]) => sql.startsWith("CREATE ROLE"))![0];
    for (const relation of relations) expect(grant).toContain(relation);
    expect(grant).not.toContain(`TO ${fixtureRuntimeRole}`);
  });
  it("contains termination and privileges in fixed disposable-only SQL", () => {
    const source = readFileSync("scripts/lib/reader-summary-successor-fixture-observer.ts", "utf8");
    expect(source).not.toMatch(/GRANT (?:pg_signal_backend|pg_read_all_settings|pg_read_all_stats)/);
    for (const clause of ["session_user <>", "target_pid IS NULL", "target_vxid IS NULL",
      "a.usename=", "a.datname=current_database()", "l.virtualtransaction=target_vxid", "v.virtualxid=target_vxid",
      "SECURITY DEFINER SET search_path=pg_catalog", "FROM PUBLIC", "UPDATE(tone)", "UPDATE(status,failed_at,updated_at)"])
      expect(source).toContain(clause);
    expect(source).not.toMatch(/TO \$\{fixtureRuntimeRole\}/);
    expect(source.match(/await assertSubjectPrivileges\(/g)).toHaveLength(2);
    const native = readFileSync("scripts/lib/reader-summary-successor-native-support.ts", "utf8");
    expect(native).toContain("return { observer, url: raw }");
    expect(native).toContain("await subject.end()");
    expect(native).toContain("await assertUnlocked(observer)");
  });
});
