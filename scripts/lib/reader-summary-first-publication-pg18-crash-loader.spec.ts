import { fork } from "node:child_process";
import type { ChildProcess, ForkOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { proveNativeFirstpubProcessCrash } from "./reader-summary-first-publication-pg18-crash.spec-support";
import * as fixture from "./reader-summary-first-publication-pg18.spec-support";
import * as reservation from "./reader-summary-first-publication-reservation";
import { loadCuratedFirstpubCrashChild } from "./reader-summary-first-publication-pg18-crash-loader.spec-support";

jest.mock("node:child_process", () => ({ fork: jest.fn(), spawnSync: jest.fn(() => { throw new Error("Native commands forbidden"); }) }));

// Invariant: the actual curated fork configuration loads the exact entry module,
// executes its IPC handler and reports success only after fake Pool COMMIT.
// Regression: dropping TS_NODE_PROJECT discovers root tsconfig and raises TS5011.
it("loads the exact crash child with the pinned test project and curated environment", async () => {
  const statements: string[] = [], sent: unknown[] = [];
  const poolOptions: unknown[] = [];
  const connection = {
    query: jest.fn(async (sql: string) => {
      statements.push(sql);
      return { rows: sql.includes("reserve_reader_summary_first_publication") ? [{ reserved: true }] : [],
        rowCount: 1, command: sql === "COMMIT" ? "COMMIT" : "SELECT" };
    }),
    release: jest.fn(),
  };
  class FakePool {
    constructor(options: unknown) { poolOptions.push(options); }
    async connect() { return connection; }
  }
  const child = Object.assign(new EventEmitter(), {
    pid: 424242, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
    kill: jest.fn((signal: NodeJS.Signals) => {
      child.signalCode = signal;
      child.emit("exit", null, signal);
      return true;
    }),
    send: jest.fn((message: unknown) => { queueMicrotask(() => ipc.emit("message", message)); }),
  });
  const ipc = new EventEmitter();
  let observed: ReturnType<typeof loadCuratedFirstpubCrashChild> | undefined;
  let loaderError: unknown;
  let capturedEnv: NodeJS.ProcessEnv | undefined;
  jest.mocked(fork).mockImplementation(((entry: string, _args: string[], options: ForkOptions) => {
    capturedEnv = options.env;
    try {
      observed = loadCuratedFirstpubCrashChild(entry, options, {
        once: (event, listener) => ipc.once(event, listener),
        send: (message) => {
          // This is observable ordering through the actual entry's reservation
          // adapter/tenant middleware, with a fake Pool rather than a database.
          sent.push(message);
          expect(statements.at(-1)).toBe("COMMIT");
          child.emit("message", message);
        },
      }, {
        pg: { Pool: FakePool },
        "./reader-summary-first-publication-reservation": reservation,
        "./reader-summary-first-publication-pg18.spec-support": fixture,
      });
    } catch (error) {
      loaderError = error;
      queueMicrotask(() => { child.exitCode = 1; child.emit("exit", 1, null); });
    }
    return child as unknown as ChildProcess;
  }) as typeof fork);
  const adminQuery = jest.fn().mockResolvedValue({ rows: [{ count: "1" }] });
  const refusingClient = { $transaction: jest.fn().mockRejectedValue(Object.assign(new Error("synthetic consumed slot"), { code: "P0001" })) };
  try {
    await proveNativeFirstpubProcessCrash({
      database: "firstpub_synthetic_claim_slots_unknown",
      socketHost: "/proc/424242/cwd/.firstpub-native-pg18-TestOnly/socket",
      admin: { query: adminQuery }, client: refusingClient,
    } as unknown as fixture.NativeFirstpubClaimFixture);
  } catch (error) { throw loaderError ?? error; }
  finally { jest.mocked(fork).mockReset(); }

  expect(capturedEnv).toEqual({ NODE_ENV: "test", TS_NODE_TRANSPILE_ONLY: "true", TS_NODE_PROJECT: resolve("test/tsconfig.jest.json") });
  expect(observed).toMatchObject({ project: resolve("test/tsconfig.jest.json"), rootDir: process.cwd(),
    entry: resolve("scripts/lib/reader-summary-first-publication-pg18-crash.spec-support.ts") });
  expect(poolOptions).toEqual([{ host: "/proc/424242/cwd/.firstpub-native-pg18-TestOnly/socket", port: 5432,
    database: "firstpub_synthetic_claim_slots_unknown", user: "firstpub_synthetic_finite", connectionTimeoutMillis: 5000, max: 1 }]);
  expect(statements[0]).toBe("BEGIN ISOLATION LEVEL READ COMMITTED");
  expect(statements.some((sql) => sql.includes("set_config('social_monitor.tenant_id'"))).toBe(true);
  expect(statements.some((sql) => sql.includes("reserve_reader_summary_first_publication"))).toBe(true);
  expect(sent).toEqual(["FIRSTPUB_COMMITTED"]);
  expect(connection.release).toHaveBeenCalledTimes(1);
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  expect(adminQuery).toHaveBeenCalledTimes(1);
  expect(refusingClient.$transaction).toHaveBeenCalledTimes(1);
});
