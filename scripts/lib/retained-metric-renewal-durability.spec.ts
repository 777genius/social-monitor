import { ok } from "@social-monitor/shared-kernel";
import type { RetainedMetricTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { fork } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import type * as NodeFilesystem from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { retainedMetricRenewalGrant as grant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";
import { RenewRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-retained-metrics.use-case";
import { implementation, renewalFixture } from "./retained-metric-renewal.spec-support";
import { canonicalMetricRefreshJson, metricRefreshDigest, SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";
const fs = jest.requireActual<typeof NodeFilesystem>("node:fs");
jest.setTimeout(180_000);
let template: string, root: string, f: ReturnType<typeof renewalFixture>;
const bytes = (path: string) => readdirSync(path).sort().map((n) => [n, readFileSync(join(path, n)).toString("hex")]);
const start = async (mode: string) => new Promise<{ response: unknown; signal: string | null }>((done, reject) => {
  const child = fork(resolve("scripts/lib/retained-metric-renewal-durability.spec-support.ts"), [root, mode], {
    execArgv: ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register"],
    env: { ...process.env, NODE_ENV: "test", NODE_OPTIONS: "--max-old-space-size=768", TS_NODE_PROJECT: "tsconfig.build.json" }, stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let response: unknown, stderr = "";
  const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("fixture child timeout")); }, 170_000);
  child.stderr!.on("data", (v: Buffer) => { stderr += v.toString(); });
  child.on("message", (v) => { response = v; }); child.on("error", reject);
  child.on("exit", (code, signal) => { clearTimeout(timeout); if (!response && (code !== null || !["lost-ack", "result-loss", "result-ack"].includes(mode))) reject(new Error(`Child exit ${code}/${signal}: ${stderr}`)); else done({ response, signal }); });
});
beforeAll(async () => {
  template = mkdtempSync(join(tmpdir(), "renewal-template-")); f = renewalFixture();
  const prior = SecureMetricRefreshReceipts.forTest(template), renewal = SecureMetricRefreshReceipts.forTest(template, undefined, "renewal");
  await prior.withOperation(async (o) => { for (const [path, value] of f.prior.values) await o.install(path, value); });
  const prepared = await new RenewRetainedMetricsUseCase(f.inventory, f.fetcher, f.projection, prior, renewal, f.clock, f.hash).prepare(implementation);
  expect(prepared.ok).toBe(true);
  writeFileSync(join(template, "current.json"), JSON.stringify(f.targets));
});
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "renewal-restart-")); cpSync(template, root, { recursive: true });
  for (const directory of ["seven-day-6101-6102", grant.predecessorPath, grant.evidencePath]) chmodSync(join(root, directory), 0o700); });
afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });
afterAll(() => rmSync(template, { recursive: true, force: true }));
it("real-adapter timeout survives a new process with reservation only, no successor or refetch", async () => {
  expect((await start("unknown")).response).toMatchObject({ result: { ok: false } });
  const before = bytes(join(root, grant.evidencePath));
  expect((await start("resume")).response).toMatchObject({ result: { ok: true, terminal: false } });
  expect(bytes(join(root, grant.evidencePath))).toEqual(before);
  expect(before.map(([name]) => name)).toEqual(["batch-0.reserved.json", "operation.json", "operation.lock"]);
  expect(readFileSync(join(root, "effects.log"), "utf8").split("\n").filter((v) => v === "provider")).toHaveLength(1);
});
it.each(["lost-ack", "result-loss", "result-ack"])("SIGKILL at %s resumes exact sample then terminal replay performs zero effects", async (mode) => {
  const predecessor = bytes(join(root, grant.predecessorPath));
  expect((await start(mode)).signal).toBe("SIGKILL");
  const observation = readFileSync(join(root, grant.evidencePath, "batch-0.observed.json"));
  expect((await start("resume")).response).toMatchObject({ result: { ok: true, terminal: true } });
  expect(readFileSync(join(root, grant.evidencePath, "batch-0.observed.json"))).toEqual(observation);
  const final = JSON.parse(readFileSync(join(root, grant.evidencePath, "final.json"), "utf8")).value;
  expect(final.results).toHaveLength(grant.originalCount);
  expect(final.results.filter((r: { status: string }) => r.status === "refreshed")).toHaveLength(1);
  expect(final.results.every((r: { status: string }) => ["refreshed", "unavailable"].includes(r.status))).toBe(true);
  const journal = bytes(join(root, grant.evidencePath)), effects = readFileSync(join(root, "effects.log"));
  expect(effects.toString().split("\n").filter((e) => e === "provider")).toHaveLength(34);
  writeFileSync(join(root, "current.json"), "[]");
  expect((await start("terminal")).response).toMatchObject({ result: { ok: true, terminal: true } });
  expect(readFileSync(join(root, "effects.log"))).toEqual(effects);
  expect(bytes(join(root, grant.evidencePath))).toEqual(journal);
  expect(bytes(join(root, grant.predecessorPath))).toEqual(predecessor);
  if (mode === "result-ack") {
    final.cells.find((cell: { authorities: unknown[] }) => cell.authorities.length).authorities = [];
    const path = join(root, grant.evidencePath, "final.json");
    chmodSync(path, 0o600); writeFileSync(path, canonicalMetricRefreshJson({ digest: metricRefreshDigest(final), value: final })); chmodSync(path, 0o400);
    expect((await start("terminal")).response).toMatchObject({ result: { ok: false } });
    expect(readFileSync(join(root, "effects.log"))).toEqual(effects);
  }
});
it.each(["partial", "malformed", "fsync"])("retains %s observation and stops before projection or successor", async (kind) => {
  const prior = SecureMetricRefreshReceipts.forTest(root), renewal = SecureMetricRefreshReceipts.forTest(root, undefined, "renewal");
  const observedPath = join(root, grant.evidencePath, "batch-0.observed.json");
  const fetcher = { fetch: jest.fn(async (batch: readonly RetainedMetricTarget[]) => ok(batch.map((t) => ({
    externalId: t.externalId, returned: true, reason: null, metadata: { kind: "reddit_post", score: 42, numComments: 9 },
  })))) };
  const originalWrite = fs.writeSync, originalSync = fs.fsyncSync;
  if (kind === "fsync") jest.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
    if (fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith(`${grant.evidencePath}/batch-0.observed.json`)) throw new Error("fixture EIO");
    return originalSync(fd);
  });
  else jest.spyOn(fs, "writeSync").mockImplementation(((fd: number, ...args: unknown[]) => {
    if (fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith(`${grant.evidencePath}/batch-0.observed.json`)) {
      originalWrite(fd, kind === "partial" ? '{"digest":' : '{}'); throw new Error("fixture partial write");
    }
    return (originalWrite as (...a: unknown[]) => number)(fd, ...args);
  }) as typeof fs.writeSync);
  const manifest = await renewal.read(`${grant.evidencePath}/operation.json`);
  const run = () => new RenewRetainedMetricsUseCase(f.inventory, fetcher, f.projection, prior, renewal, f.clock, f.hash).execute(f.hash(manifest));
  expect(await run()).toMatchObject({ ok: false }); expect(f.projection.project).not.toHaveBeenCalled();
  const kept = readFileSync(observedPath); const fetches = fetcher.fetch.mock.calls.length;
  if (kind !== "fsync") jest.restoreAllMocks(); // Complete fsync failure remains refused while the barrier is unavailable.
  expect(await run()).toMatchObject({ ok: false });
  expect(readFileSync(observedPath)).toEqual(kept); expect(fetcher.fetch).toHaveBeenCalledTimes(fetches);
  expect(await renewal.read(`${grant.evidencePath}/batch-1.reserved.json`)).toBeNull();
});
