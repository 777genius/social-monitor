import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { resolve } from "node:path";
import { createFirstpubPg18Lifecycle } from "./reader-summary-first-publication-pg18-lifecycle.spec-support";
import { expectFirstpubPrismaSqlState } from "./reader-summary-first-publication-pg18-prisma.spec-support";
import { loadCuratedFirstpubCrashChild } from "./reader-summary-first-publication-pg18-crash-loader.spec-support";

jest.mock("node:child_process", () => ({ spawnSync: jest.fn() }));

// These are bounded synthetic observations, never generated-client instances.
const pinnedRefusal = (overrides: object = {}) => Object.freeze(Object.assign(new Error("offline refusal"), {
  name: "PrismaClientKnownRequestError", clientVersion: "7.9.1", code: "P2010",
  meta: Object.freeze({ driverAdapterError: Object.freeze({ cause: Object.freeze({ originalCode: "P0001" }) }) }),
}, overrides));

it("accepts the pinned nested refusal without rewriting its identity or diagnostic", async () => {
  const error = pinnedRefusal();
  const rejected = Promise.reject(error);
  await expectFirstpubPrismaSqlState(rejected, "P0001");
  expect(await rejected.catch((failure: unknown) => failure)).toBe(error);
  expect(error.code).toBe("P2010");
  expect(error.meta.driverAdapterError.cause.originalCode).toBe("P0001");
});

it.each([
  ["raw top SQLSTATE", { code: "P0001" }],
  ["missing nested code", { meta: { driverAdapterError: { cause: {} } } }],
  ["wrong nested code", { meta: { driverAdapterError: { cause: { originalCode: "55P03" } } } }],
  ["wrong version", { clientVersion: "7.9.0" }],
  ["unrelated name", { name: "Error" }],
])("rejects %s rather than accepting a consumed-slot refusal", async (_label, overrides) => {
  const error = pinnedRefusal(overrides);
  const rejected = Promise.reject(error);
  await expect(expectFirstpubPrismaSqlState(rejected, "P0001")).rejects.toThrow();
  expect(await rejected.catch((failure: unknown) => failure)).toBe(error);
});

it("rejects unrelated failures unchanged", async () => {
  const error = new Error("unrelated offline failure");
  const rejected = Promise.reject(error);
  await expect(expectFirstpubPrismaSqlState(rejected, "P0001")).rejects.toThrow();
  expect(await rejected.catch((failure: unknown) => failure)).toBe(error);
});

// RED if once returns the IPC port's value, loses symbol/variadic listeners,
// or invokes the captured EventEmitter method without its private receiver.
it("keeps fluent once and listener receivers inside the private process realm", () => {
  const entry = resolve("scripts/lib/reader-summary-first-publication-pg18-crash.spec-support.ts");
  const registrations: Array<{ event: string; listener: (message: unknown) => void }> = [];
  const opaquePortReturn = Object.freeze({ offline: true });
  const observed = loadCuratedFirstpubCrashChild(entry, {
    cwd: process.cwd(), env: { NODE_ENV: "test", TS_NODE_TRANSPILE_ONLY: "true", TS_NODE_PROJECT: resolve("test/tsconfig.jest.json") },
    execArgv: ["-r", resolve("node_modules/ts-node/register/transpile-only"), "-r", resolve("node_modules/tsconfig-paths/register")],
  }, {
    once: (event, listener) => { registrations.push({ event, listener }); return opaquePortReturn; },
    send: () => { throw new Error("IPC execution forbidden in once contract"); },
  }, {
    pg: { Pool: class { constructor() { throw new Error("Pool forbidden in once contract"); } } },
    "./reader-summary-first-publication-pg18-prisma.spec-support": { expectFirstpubPrismaSqlState },
    "./reader-summary-first-publication-reservation": {},
    "./reader-summary-first-publication-pg18.spec-support": {},
  });
  const privateProcess = observed.isolation.process;
  expect(privateProcess).not.toBe(process);
  const received: unknown[] = [];
  const listener = (message: unknown) => { received.push(message); };
  expect(privateProcess.once("message", listener) === privateProcess).toBe(true);
  const registration = registrations.at(-1);
  expect(registration).toEqual({ event: "message", listener });
  registration?.listener(opaquePortReturn);
  expect(received).toEqual([opaquePortReturn]);
  const event = Symbol("offline once");
  const observations: unknown[] = [];
  expect(privateProcess.once(event, function (this: unknown, ...args: unknown[]) {
    observations.push(this, args);
  })).toBe(privateProcess);
  privateProcess.emit(event, "first", opaquePortReturn);
  privateProcess.emit(event, "second");
  expect(observations).toEqual([privateProcess, ["first", opaquePortReturn]]);
});

// All lifecycle effects below are explicit in-memory FS/command ports. No
// native namespace, child, /proc read, Pool, SQL or generated graph is used.
describe("offline owned evidence descriptor failures", () => {
  const namespace = "/offline/.firstpub-native-pg18-TestOnly";
  const evidencePath = `${namespace}/lifecycle.json`;
  const fd = 731;
  const writeFailure = new Error("offline evidence write failure");
  const closeFailure = new Error("offline evidence close failure");
  let writes: string[];
  let closes: number[];
  let failWrite: boolean;
  let failClose: boolean;
  let failOpen: boolean;

  beforeEach(() => {
    writes = []; closes = []; failWrite = false; failClose = false; failOpen = false;
    jest.spyOn(process, "getuid").mockReturnValue(1000);
    jest.spyOn(process, "geteuid").mockReturnValue(1000);
    jest.spyOn(process, "cwd").mockReturnValue("/offline");
    jest.spyOn(fs, "realpathSync").mockImplementation((path) => String(path));
    jest.spyOn(fs, "mkdtempSync").mockReturnValue(namespace);
    jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    const directory = Object.assign(fs.lstatSync(__filename), { uid: 1000, dev: 7, ino: 9, mode: 0o40700 });
    jest.spyOn(directory, "isDirectory").mockReturnValue(true);
    jest.spyOn(directory, "isSymbolicLink").mockReturnValue(false);
    jest.spyOn(fs, "lstatSync").mockReturnValue(directory);
    jest.spyOn(fs, "openSync").mockImplementation((path, flags, mode) => {
      expect(path).toBe(evidencePath);
      expect(flags).toBe(fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW);
      expect(mode).toBe(0o600);
      if (failOpen) throw writeFailure;
      return fd;
    });
    jest.spyOn(fs, "writeFileSync").mockImplementation((descriptor, value) => {
      expect(descriptor).toBe(fd);
      const text = String(value);
      // Fail at terminal uncertainty, after the first command evidence was
      // successfully closed. Catch must not retry/replace this original cause.
      if (text.includes('"uncertain"') && failWrite) throw writeFailure;
      writes.push(text);
    });
    jest.spyOn(fs, "closeSync").mockImplementation((descriptor) => {
      expect(descriptor).toBe(fd);
      closes.push(descriptor);
      if (failClose && closes.length > 1) throw closeFailure;
    });
    jest.mocked(spawnSync).mockReturnValue({ pid: 0, output: [], stdout: "postgres (PostgreSQL) 18.6", stderr: "", status: 1, signal: null });
  });
  afterEach(() => { jest.restoreAllMocks(); jest.mocked(spawnSync).mockReset(); });

  const attempt = () => {
    const lifecycle = createFirstpubPg18Lifecycle("/offline/bin");
    let failure: unknown;
    try { lifecycle.initializeAndStart(); } catch (error) { failure = error; }
    expect(lifecycle.isOwned()).toBe(false);
    return { lifecycle, failure };
  };

  it("closes the owned descriptor on success and retains terminal uncertainty", () => {
    const { lifecycle, failure } = attempt();
    expect(failure).toBeInstanceOf(Error);
    expect(JSON.parse(writes.at(-1) ?? "[]").at(-1)).toMatchObject({ state: "uncertain" });
    expect(closes).toEqual(writes.map(() => fd));
    expect(() => lifecycle.stop()).toThrow(/no confirmed owned postmaster/u);
    expect(lifecycle.isOwned()).toBe(false);
  });

  it("closes after a failed write and throws that exact original cause", () => {
    failWrite = true;
    const { failure } = attempt();
    expect(failure).toBe(writeFailure);
    expect(closes).toEqual([fd, fd]);
  });

  it("retains the exact close failure after a successful evidence write", () => {
    failClose = true;
    const { failure } = attempt();
    expect(failure).toBe(closeFailure);
    expect(closes).toEqual([fd, fd]);
  });

  it("retains both original write and close causes in order", () => {
    failWrite = true; failClose = true;
    const { failure } = attempt();
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error("Missing evidence failure aggregate");
    expect(failure.errors).toEqual([writeFailure, closeFailure]);
    expect(failure.errors[0]).toBe(writeFailure);
    expect(failure.errors[1]).toBe(closeFailure);
    expect(closes).toEqual([fd, fd]);
  });

  it("does not close an unacquired descriptor when open refuses", () => {
    failOpen = true;
    const { failure } = attempt();
    expect(failure).toBe(writeFailure);
    expect(closes).toEqual([]);
    expect(writes).toEqual([]);
  });
});
