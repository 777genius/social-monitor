import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import type * as Pg from "pg";
import { createFirstPublicationPg18Fixture } from "./reader-summary-first-publication-pg18.spec-support";

// Explicitly selects lifecycle fault/retention coverage, without an application
// generated graph. The genuine fixture's default prerequisite is unchanged.
const offlineLifecycle = { kind: "offline-lifecycle-faults" } as const;

jest.mock("node:child_process", () => ({ spawnSync: jest.fn() }));
jest.mock("pg", () => ({ Pool: jest.fn().mockImplementation(() => ({
  query: jest.fn().mockRejectedValue(new Error("synthetic SQL setup refused")),
  end: jest.fn().mockResolvedValue(undefined),
})), types: jest.requireActual<typeof Pg>("pg").types }));

const spawn = jest.mocked(spawnSync);
let scratch: string, bin: string;
let commands: string[];
let mode: string;
let live: boolean;
let statuses: number;
let postmasterStatus: string;
const priorBin = process.env.FIRSTPUB_NATIVE_PG18_BIN;
const realRead = fs.readFileSync, realStat = fs.statSync, realLstat = fs.lstatSync;
const realRealpath = fs.realpathSync;
const realWrite = fs.writeFileSync, realOpen = fs.openSync, realClose = fs.closeSync;
const pid = 424242;
const result = (status: number | null, stdout = "", signal: NodeJS.Signals | null = null, code?: string) => ({
  status, stdout, stderr: "synthetic output must not be persisted", signal,
  ...(code ? { error: Object.assign(new Error("sensitive error text"), { code }) } : {}),
  pid: 100, output: [],
});
const namespace = () => fs.readdirSync(scratch).find((p) => p.startsWith(".firstpub-native-pg18-"));
const root = () => join(scratch, namespace()!);

beforeEach(() => {
  const scratchParent = join(process.cwd(), ".cache");
  fs.mkdirSync(scratchParent, { recursive: true });
  scratch = fs.mkdtempSync(join(scratchParent, "firstpub-lifecycle-test-"));
  bin = join(scratch, "bin"); fs.mkdirSync(bin);
  for (const name of ["initdb", "pg_ctl", "postgres"]) fs.writeFileSync(join(bin, name), "synthetic only");
  process.env.FIRSTPUB_NATIVE_PG18_BIN = bin;
  jest.spyOn(process, "cwd").mockReturnValue(scratch);
  jest.spyOn(process, "getuid").mockReturnValue(1000);
  jest.spyOn(process, "geteuid").mockReturnValue(1000);
  commands = []; mode = "timeout"; live = false; statuses = 0;
  postmasterStatus = "ready";
  spawn.mockImplementation((file, args) => {
    const argv = args as string[];
    const name = String(file).split("/").at(-1)!;
    const action = argv.includes("--version") ? "version" : argv.at(-1)!;
    commands.push(`${name}:${action}`);
    if (action === "version") return result(0, "postgres (PostgreSQL) 18.6");
    const data = argv[argv.indexOf("-D") + 1]!;
    if (name === "initdb") { fs.mkdirSync(data); return result(0); }
    if (action === "start") {
      live = true;
      if (mode !== "missing-pid") fs.writeFileSync(join(data, "postmaster.pid"), mode === "empty-pid" ? "" : `${pid}\n${data}\n${Math.floor(Date.now() / 1000)}\n5432\n${`/proc/${process.pid}/cwd/${namespace()}/socket`}\n\n\n${postmasterStatus}\n`);
      if (mode === "timeout") return result(null, "", "SIGTERM", "ETIMEDOUT");
      if (mode === "signal") return result(null, "", "SIGKILL");
      if (mode === "spawn-error") return result(null, "", null, "ENOENT");
      if (mode === "start-nonzero") return result(1);
      return result(0);
    }
    if (action === "status") {
      statuses++;
      if (statuses === 2 && mode === "changed-root-before-stop") {
        const originalRoot = root();
        fs.renameSync(originalRoot, `${originalRoot}-retained`);
        fs.mkdirSync(originalRoot, { mode: 0o700 });
        fs.writeFileSync(join(originalRoot, "foreign-marker"), "untouched");
      }
      if (statuses === 2 && mode === "changed-pid-before-stop") fs.writeFileSync(join(data, "postmaster.pid"), "777777\n");
      if (statuses === 2 && mode === "changed-namespace-before-stop") fs.renameSync(join(root(), "socket"), join(root(), "retained-socket"));
      if (statuses === 2 && mode === "changed-namespace-before-stop") fs.symlinkSync(bin, join(root(), "socket"));
      if (mode === "status-wrong-pid") return result(0, `pg_ctl: server is running (PID: ${pid + 1})`);
      if (mode === "stop-status-signal" && !live) return result(3, "", "SIGTERM");
      if (mode === "stop-pid-retained" && !live) return result(3);
      if (mode === "status-failed") return result(1);
      if (mode === "status-empty") return result(0);
      return live ? result(0, `pg_ctl: server is running (PID: ${pid})`) : result(3);
    }
    if (action === "stop") {
      if (mode === "stop-timeout") return result(null, "", "SIGTERM", "ETIMEDOUT");
      live = false;
      if (mode !== "stop-pid-retained") fs.unlinkSync(join(data, "postmaster.pid"));
      if (mode === "stop-status-failed") mode = "status-failed";
      return result(0);
    }
    throw new Error("Unexpected lifecycle command");
  });
  const proc = `/proc/${pid}`;
  const stat = (path: fs.PathLike, original: typeof fs.statSync) => {
    if (String(path) === proc) {
      if (!live && mode !== "stop-process-retained") throw Object.assign(new Error("absent"), { code: "ENOENT" });
      return Object.assign(realStat(scratch), { uid: mode === "foreign-uid" ? 1001 : 1000 });
    }
    return Object.assign(original(path), { uid: 1000 });
  };
  jest.spyOn(fs, "statSync").mockImplementation(((path: fs.PathLike) => stat(path, realStat)) as typeof fs.statSync);
  jest.spyOn(fs, "lstatSync").mockImplementation(((path: fs.PathLike) => stat(path, realLstat)) as typeof fs.lstatSync);
  jest.spyOn(fs, "realpathSync").mockImplementation(((path: fs.PathLike) => String(path) === `${proc}/exe` ? (mode === "foreign-executable" ? join(bin, "foreign", "postgres") : join(bin, "postgres")) : realRealpath(path)) as typeof fs.realpathSync);
  jest.spyOn(fs, "readFileSync").mockImplementation(((path: fs.PathOrFileDescriptor, options?: unknown) => {
    if (String(path) === `${proc}/stat`) return `${pid} (postgres) S 1 ${"0 ".repeat(17)}98765 0`;
    if (String(path) === `${proc}/cmdline`) return `${join(bin, "postgres")}\0-D\0${join(root(), "data")}\0`;
    return realRead(path, options as BufferEncoding);
  }) as typeof fs.readFileSync);
});
afterEach(() => {
  jest.restoreAllMocks(); spawn.mockReset();
  if (priorBin === undefined) delete process.env.FIRSTPUB_NATIVE_PG18_BIN;
  else process.env.FIRSTPUB_NATIVE_PG18_BIN = priorBin;
  // Test-owned fake files only. No native process was started by these tests.
  fs.rmSync(scratch, { recursive: true, force: true });
});

// A real PG18 postmaster writes ready plus three spaces. Admission still
// requires the complete independent process identity and verified shutdown.
it.each(["ready", "ready   "])("admits the genuine ready status format and verifies owned shutdown: %j", async (status) => {
  mode = "normal"; postmasterStatus = status;
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow("synthetic SQL setup refused");
  expect(commands.filter((command) => command === "pg_ctl:stop")).toHaveLength(1);
  const evidence = JSON.parse(realRead(join(root(), "lifecycle.json"), "utf8")) as { state: string }[];
  expect(evidence.at(-1)).toMatchObject({ state: "verified-stopped", identity: { pid, uid: 1000, startTicks: "98765" } });
  expect(fs.existsSync(join(root(), "data"))).toBe(true);
});

it.each(["starting", "standby ", "stopping", "", "readyx", " ready", "ready\t"])("refuses non-ready or malformed status without shutdown: %j", async (status) => {
  mode = "normal"; postmasterStatus = status;
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow(/uncertain/u);
  expect(commands).not.toContain("pg_ctl:stop");
  expect(fs.existsSync(join(root(), "data"))).toBe(true);
});

it.each(["getuid", "geteuid"] as const)("rejects root %s before creating a namespace or issuing any command", async (kind) => {
  jest.spyOn(process, kind).mockReturnValue(0);
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow(/nonroot/u);
  expect(namespace()).toBeUndefined(); expect(commands).toEqual([]);
});

it.each(["timeout", "signal", "spawn-error", "start-nonzero", "missing-pid", "empty-pid", "status-failed", "status-empty", "status-wrong-pid", "foreign-uid", "foreign-executable"])(
  "retains namespace and never issues stop after uncertain startup: %s", async (fault) => {
    mode = fault;
    await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow();
    expect(commands).not.toContain("pg_ctl:stop");
    expect(fs.existsSync(join(root(), "data"))).toBe(true);
    expect(fs.existsSync(join(root(), "socket"))).toBe(true);
  },
);

it.each(["stop-timeout", "stop-status-failed", "stop-status-signal", "stop-pid-retained", "stop-process-retained"])("retains namespace after uncertain owned shutdown: %s", async (fault) => {
  mode = fault;
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow();
  expect(commands.filter((c) => c === "pg_ctl:stop")).toHaveLength(1);
  expect(fs.existsSync(join(root(), "data"))).toBe(true);
  expect(fs.existsSync(join(root(), "socket"))).toBe(true);
});

it.each(["changed-pid-before-stop", "changed-namespace-before-stop"])("refuses stop when owned identity changes: %s", async (fault) => {
  mode = fault;
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow();
  expect(commands).not.toContain("pg_ctl:stop");
  expect(fs.existsSync(join(root(), "data"))).toBe(true);
  expect(fs.existsSync(join(root(), "socket"))).toBe(true);
});

it("refuses stop, cleanup and evidence writes into a replaced namespace", async () => {
  mode = "changed-root-before-stop";
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow();
  expect(commands).not.toContain("pg_ctl:stop");
  expect(realRead(join(root(), "foreign-marker"), "utf8")).toBe("untouched");
  expect(fs.readdirSync(root())).toEqual(["foreign-marker"]);
  expect(fs.existsSync(join(`${root()}-retained`, "data"))).toBe(true);
  expect(fs.existsSync(join(`${root()}-retained`, "socket"))).toBe(true);
});

it("records redacted startup outcome and state evidence", async () => {
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow();
  const log = realRead(join(root(), "lifecycle.json"), "utf8");
  const events = JSON.parse(log) as { state: string; action?: string; exit?: number | null; signal?: string; spawnError?: string }[];
  expect(events.map((e) => e.state)).toEqual(expect.arrayContaining(["initialized", "start-requested", "uncertain"]));
  expect(events.find((e) => e.action === "start")).toMatchObject({ exit: null, signal: "SIGTERM", spawnError: "ETIMEDOUT" });
  expect(log).not.toContain("sensitive error text");
  expect(log).not.toContain("synthetic output");
});

// Invariant: a verified stop retains the complete namespace and truthful evidence.
// Regression: successful shutdown reintroduces automatic data/socket deletion.
it("retains the entire namespace after owned identity and verified shutdown", async () => {
  mode = "normal";
  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow("synthetic SQL setup refused");
  expect(commands.filter((c) => c === "pg_ctl:stop")).toHaveLength(1);
  expect(fs.existsSync(join(root(), "data"))).toBe(true);
  expect(fs.existsSync(join(root(), "socket"))).toBe(true);
  expect(fs.existsSync(root())).toBe(true);
  const evidence = JSON.parse(realRead(join(root(), "lifecycle.json"), "utf8")) as { state: string; identity?: object }[];
  expect(evidence.at(-1)).toMatchObject({ state: "verified-stopped", namespace: "retained", identity: { pid, uid: 1000, startTicks: "98765" } });
});

// Invariant: a new live PID at the former cleanup boundary cannot lose any bytes.
// Regression: directory inode checks admit recursive deletion after a restart.
it("retains restarted data and socket bytes during verified-stop evidence write", async () => {
  mode = "normal";
  const restartedPid = pid + 1;
  const dataBytes = Buffer.from("test-owned data evidence\0\xff", "latin1");
  const socketBytes = Buffer.from("test-owned socket evidence\0\xfe", "latin1");
  let restarted = false;
  const evidenceFds = new Set<number>();
  jest.spyOn(fs, "openSync").mockImplementation((path, flags, fileMode) => {
    const fd = realOpen(path, flags, fileMode);
    if (String(path).endsWith("/lifecycle.json")) evidenceFds.add(fd);
    return fd;
  });
  jest.spyOn(fs, "closeSync").mockImplementation((fd) => {
    try { realClose(fd); } finally { evidenceFds.delete(fd); }
  });
  jest.spyOn(fs, "writeFileSync").mockImplementation(((path, value, options) => {
    if (!restarted && typeof path === "number" && evidenceFds.has(path) && String(value).includes('"verified-stopped"')) {
      // Actual status3, original PID-file absence and original /proc absence
      // have already been observed. Restart only at the evidence-write boundary.
      expect(live).toBe(false);
      expect(statuses).toBe(3);
      expect(fs.existsSync(join(root(), "data", "postmaster.pid"))).toBe(false);
      expect(() => fs.lstatSync(`/proc/${pid}`)).toThrow();
      restarted = true; live = true;
      realWrite(join(root(), "data", "postmaster.pid"), `${restartedPid}\n`);
      realWrite(join(root(), "data", "retained-marker"), dataBytes);
      realWrite(join(root(), "socket", "retained-marker"), socketBytes);
    }
    return realWrite(path, value, options);
  }) as typeof fs.writeFileSync);
  const observedLstat = jest.mocked(fs.lstatSync).getMockImplementation()!;
  jest.spyOn(fs, "lstatSync").mockImplementation(((path) => String(path) === `/proc/${restartedPid}` && restarted
    ? Object.assign(realLstat(scratch), { uid: 1000 }) : observedLstat(path)) as typeof fs.lstatSync);

  await expect(createFirstPublicationPg18Fixture(offlineLifecycle)).rejects.toThrow("synthetic SQL setup refused");
  expect(evidenceFds.size).toBe(0);
  expect(restarted).toBe(true);
  expect(live).toBe(true);
  expect(fs.lstatSync(`/proc/${restartedPid}`).uid).toBe(1000);
  expect(commands.filter((c) => c === "pg_ctl:stop")).toHaveLength(1);
  expect(realRead(join(root(), "data", "postmaster.pid"), "utf8")).toBe(`${restartedPid}\n`);
  expect(realRead(join(root(), "data", "retained-marker"))).toEqual(dataBytes);
  expect(realRead(join(root(), "socket", "retained-marker"))).toEqual(socketBytes);
  const evidence = JSON.parse(realRead(join(root(), "lifecycle.json"), "utf8")) as { state: string }[];
  expect(evidence.at(-1)).toMatchObject({ state: "verified-stopped", namespace: "retained" });
});
