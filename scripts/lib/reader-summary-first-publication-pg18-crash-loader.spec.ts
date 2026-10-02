import { fork } from "node:child_process";
import type { ChildProcess, ForkOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { proveNativeFirstpubProcessCrash } from "./reader-summary-first-publication-pg18-crash.spec-support";
import * as fixture from "./reader-summary-first-publication-pg18.spec-support";
import * as reservation from "./reader-summary-first-publication-reservation";
import { loadCuratedFirstpubCrashChild } from "./reader-summary-first-publication-pg18-crash-loader.spec-support";

jest.mock("node:child_process", () => ({ fork: jest.fn(), spawnSync: jest.fn(() => { throw new Error("Native commands forbidden"); }) }));

// Invariant: the actual curated fork configuration loads the exact entry module,
// executes its IPC handler and reports success only after fake Pool COMMIT.
// Regression: dropping TS_NODE_PROJECT discovers root tsconfig and raises TS5011.
it("loads the exact crash child with the pinned test project and curated environment", async () => {
  const assertSharedUnchanged = observeSharedLoaderState();
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

  assertSharedUnchanged();
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

// Compare runtime object/function/descriptor identity; no copied source-map
// implementation or assumed handler counts. Observe both Jest and Node realms.
function observeSharedLoaderState() {
  const host = runInThisContext("globalThis") as typeof globalThis;
  const sharedModule = createRequire(__filename)("node:module") as {
    _resolveFilename: unknown; _cache: Record<string, NodeModule>; _extensions: object;
    _pathCache: object; prototype: object;
  };
  const assertions: Array<() => void> = [];
  const seen = new Set<object>();
  const record = (target: object, recursive = false) => {
    if (seen.has(target)) return;
    seen.add(target);
    const keys = Reflect.ownKeys(target);
    const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(target, key)!);
    assertions.push(() => {
      expect(Reflect.ownKeys(target)).toEqual(keys);
      keys.forEach((key, index) => {
        const after = Object.getOwnPropertyDescriptor(target, key)!;
        for (const field of ["value", "get", "set", "writable", "enumerable", "configurable"] as const) {
          expect(after[field]).toBe(descriptors[index]![field]);
        }
      });
    });
    if (recursive) for (const descriptor of descriptors) {
      const value: unknown = descriptor.value;
      if (value !== null && typeof value === "object") record(value, true);
    }
  };
  record(sharedModule); record(sharedModule.prototype); record(sharedModule._cache);
  record(sharedModule._extensions); record(sharedModule._pathCache);
  record(host.Error); record(Error); record(host.EventTarget.prototype);
  record(EventEmitter.prototype);
  for (const runtime of new Set([process, host.process])) {
    const emit = runtime.emit;
    const symbols = Object.getOwnPropertySymbols(runtime);
    const instance = Reflect.get(runtime, Symbol.for("ts-node.register.instance")) as unknown;
    const listeners = runtime.eventNames().map((event) => [event, runtime.rawListeners(event)] as const);
    assertions.push(() => {
      expect(runtime.emit).toBe(emit);
      expect(Object.getOwnPropertySymbols(runtime)).toEqual(symbols);
      expect(Reflect.get(runtime, Symbol.for("ts-node.register.instance"))).toBe(instance);
      expect(runtime.eventNames()).toEqual(listeners.map(([event]) => event));
      for (const [event, before] of listeners) {
        const after = runtime.rawListeners(event);
        expect(after.length).toBe(before.length);
        after.forEach((listener, index) => expect(listener).toBe(before[index]));
      }
    });
  }
  for (const realm of new Set([globalThis, host])) {
    const key = Symbol.for("source-map-support/sharedData");
    const descriptor = Object.getOwnPropertyDescriptor(realm, key);
    assertions.push(() => {
      const after = Object.getOwnPropertyDescriptor(realm, key);
      expect(after?.value).toBe(descriptor?.value);
      expect(after?.configurable).toBe(descriptor?.configurable);
      expect(after?.writable).toBe(descriptor?.writable);
      expect(after?.enumerable).toBe(descriptor?.enumerable);
    });
    if (descriptor?.value) record(descriptor.value as object, true);
  }
  for (const mod of Object.values(sharedModule._cache)) {
    // Some cached modules expose exports via an identity-unstable getter.
    // Observe its actual descriptor instead of evaluating that getter twice.
    record(mod); record(mod.children);
  }
  return () => { for (const assertion of assertions) assertion(); };
}

// Regression: installed transitive source-map support or Node's eager REPL
// escapes the private boundary. A success-only restore also misses TS5011.
it.each(["pinned project", "root project TS5011"])("contains actual compiler hooks/cache/registrations after %s", (mode) => {
  const entry = resolve("scripts/lib/reader-summary-first-publication-pg18-crash.spec-support.ts");
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", TS_NODE_TRANSPILE_ONLY: "true" };
  if (mode === "pinned project") env.TS_NODE_PROJECT = resolve("test/tsconfig.jest.json");
  const once = jest.fn(), send = jest.fn();
  class ForbiddenPool { constructor() { throw new Error("Pool construction forbidden in isolation probe"); } }
  const options = { cwd: process.cwd(), env, execArgv: ["-r", resolve("node_modules/ts-node/register/transpile-only"),
    "-r", resolve("node_modules/tsconfig-paths/register")] };
  let prior: ReturnType<typeof loadCuratedFirstpubCrashChild> | undefined;
  for (let repeat = 0; repeat < 2; repeat++) {
    const assertSharedUnchanged = observeSharedLoaderState();
    let observed: ReturnType<typeof loadCuratedFirstpubCrashChild> | undefined;
    let failure: unknown;
    try {
      observed = loadCuratedFirstpubCrashChild(entry, options, { once, send }, {
        pg: { Pool: ForbiddenPool }, "./reader-summary-first-publication-reservation": {},
        "./reader-summary-first-publication-pg18.spec-support": {},
      });
    } catch (error) { failure = error; }
    // Check containment before checking compilation so old923c fails on the
    // real leaked identities, even on its genuine diagnostic failure path.
    assertSharedUnchanged();
    if (mode === "root project TS5011") {
      expect(failure).toMatchObject({ diagnosticCodes: [5011] });
      expect(String(failure)).toContain("TS5011");
      expect(once).not.toHaveBeenCalled();
    } else {
      expect(failure).toBeUndefined();
      expect(observed).toMatchObject({ entry, project: env.TS_NODE_PROJECT, rootDir: process.cwd(), transpileOnly: true });
      expect(once).toHaveBeenCalledTimes(repeat + 1);
      const isolated = observed!.isolation;
      const registration: unknown = Reflect.get(isolated.process, Symbol.for("ts-node.register.instance"));
      expect(registration).toBeDefined();
      const data = isolated.global[Symbol.for("source-map-support/sharedData")] as {
        moduleResolveFilenameHook: { installedValue: unknown }; errorPrepareStackTraceHook: { installedValue: unknown };
        processEmitHook: { installedValue: unknown }; retrieveFileHandlers: unknown[];
      };
      expect(data.moduleResolveFilenameHook.installedValue).toBeDefined();
      // tsconfig-paths wraps the private resolver after source-map support.
      expect(data.processEmitHook.installedValue).toBe(isolated.process.emit);
      expect(data.errorPrepareStackTraceHook.installedValue).toBe(Reflect.get(isolated.global.Error as object, "prepareStackTrace"));
      expect(data.retrieveFileHandlers.length).toBeGreaterThan(0);
      const modules = Object.keys(isolated.module._cache);
      expect(modules.some((file) => file.endsWith("/typescript/lib/typescript.js"))).toBe(true);
      expect(modules.some((file) => file.endsWith("/@cspotcode/source-map-support/source-map-support.js"))).toBe(true);
      expect(isolated.module._cache[entry]).toBeDefined();
      const privateRequire = isolated.module.createRequire(entry);
      const redirected = privateRequire.resolve("source-map-support");
      expect(redirected).toContain("/@cspotcode/source-map-support/");
      expect(privateRequire("source-map-support")).toBe(isolated.module._cache[redirected]!.exports);
      if (prior) {
        expect(isolated.module._cache).not.toBe(prior.isolation.module._cache);
        expect(registration).not.toBe(Reflect.get(prior.isolation.process, Symbol.for("ts-node.register.instance")));
        expect(data).not.toBe(prior.isolation.global[Symbol.for("source-map-support/sharedData")]);
      }
      prior = observed;
    }
    expect(send).not.toHaveBeenCalled();
    assertSharedUnchanged();
  }
});
