import { fork, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { incidentFixture } from "./retained-metric-amendment.spec-support";
import { metricRefreshDigest } from "./retained-metric-refresh-receipts";
import type { MetricProcessInput } from "./retained-metric-process.spec-support";
import type { RetainedMetricTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { metricEvidencePath, resolveMetricOperation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-amendment";

// Each case starts multiple fresh Node runtimes; allow slow disposable filesystems.
jest.setTimeout(180_000);
describe("independent-process amendment/apply races and abrupt death", () => {
  let root: string, f: ReturnType<typeof incidentFixture>, serial: number;
  const children = new Set<ChildProcess>();
  const current = (rows: readonly RetainedMetricTarget[] = f.current()) => writeFileSync(join(root, "current.json"), JSON.stringify(rows));
  const start = (input: MetricProcessInput) => {
    const path = join(root, `input-${++serial}.json`); writeFileSync(path, JSON.stringify(input));
    const child = fork(resolve("scripts/lib/retained-metric-process.spec-support.ts"), [root, path], {
      execArgv: ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register"],
      env: { ...process.env, NODE_ENV: "test", TS_NODE_PROJECT: "tsconfig.build.json" }, stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    children.add(child);
    let errorText = "", response: unknown;
    child.stderr!.on("data", (v: Buffer) => { errorText += v.toString(); });
    const pauseMessage = new Promise<void>((done) => child.on("message", (v: { paused?: string }) => { if (v.paused) done(); }));
    const completed = new Promise<{ response: unknown; signal: string | null; code: number | null }>((done, reject) => {
      child.on("message", (v) => { response = v; }); child.on("error", reject);
      child.on("exit", (code, signal) => { children.delete(child); if (!response && signal !== "SIGKILL") reject(new Error(errorText || `Child exit ${code}`)); else done({ response, code, signal }); });
    });
    const paused = Promise.race([pauseMessage, completed.then(() => { throw new Error(errorText || "Child exited before pause"); })]);
    void paused.catch(() => {}); void completed.catch(() => {});
    return { child, paused, completed };
  };
  const proposal = async () => {
    const p = await f.amendment().prepare(metricRefreshDigest(f.original), "TEST reviewed content version");
    if (!p.ok) throw new Error(p.error); return p.value;
  };
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "metric-process-")); f = incidentFixture(root, 1); serial = 0;
    await f.receipts.install(metricEvidencePath("operation.json"), f.original); current();
  });
  afterEach(async () => {
    await Promise.all([...children].map((child) => new Promise<void>((done) => {
      child.once("exit", () => done()); child.kill("SIGKILL");
    })));
    children.clear(); rmSync(root, { recursive: true, force: true });
  });
  it("amendment wins; old-SHA apply is excluded while held and stale before any effects afterward", async () => {
    const p = await proposal();
    const writer = start({ action: "commit", manifest: f.original, proposal: p, pauseName: "amendment-000001.json" });
    await writer.paused;
    expect((await start({ action: "apply", manifest: f.original }).completed).response).toMatchObject({ error: expect.stringContaining("fence busy") });
    writer.child.send("continue"); expect((await writer.completed).response).toMatchObject({ result: { ok: true } });
    expect((await start({ action: "apply", manifest: f.original }).completed).response).toEqual({ result: { ok: false, error: "reviewed_manifest_sha_mismatch" } });
    expect(existsSync(join(root, "fetches.log"))).toBe(false);
  });
  it("apply paused immediately before first reservation excludes amendment; reservation permanently freezes head", async () => {
    const p = await proposal(); current(f.original.targets);
    const writer = start({ action: "apply", manifest: f.original, pauseName: "batch-0.reserved.json", killPoint: "install_ack", killName: "batch-0.reserved.json" });
    await writer.paused;
    expect((await start({ action: "commit", manifest: f.original, proposal: p }).completed).response).toMatchObject({ error: expect.stringContaining("fence busy") });
    writer.child.send("continue"); expect((await writer.completed).signal).toBe("SIGKILL"); current();
    expect((await start({ action: "commit", manifest: f.original, proposal: p }).completed).response).toMatchObject({ error: "metric_budget_already_started" });
    expect(existsSync(join(root, "fetches.log"))).toBe(false);
  });
  it("two unequal committers cannot fork; identical committed replay is deterministic", async () => {
    const first = await proposal();
    const secondResult = await f.amendment().prepare(first.priorEffectiveSha, "Different explicit review");
    if (!secondResult.ok) throw new Error(secondResult.error); const second = secondResult.value;
    const writer = start({ action: "commit", manifest: f.original, proposal: second, pauseName: "amendment-000001.json" });
    await writer.paused;
    expect((await start({ action: "commit", manifest: f.original, proposal: first }).completed).response).toMatchObject({ error: expect.stringContaining("fence busy") });
    writer.child.send("continue"); const accepted = (await writer.completed).response;
    expect(accepted).toMatchObject({ result: { ok: true } });
    expect((await start({ action: "commit", manifest: f.original, proposal: second }).completed).response).toEqual(accepted);
    expect((await start({ action: "commit", manifest: f.original, proposal: first }).completed).response).toEqual({ result: { ok: false, error: "stale_amendment_head" } });
  });
  it.each(["file_created", "file_partial", "file_written", "file_synced", "directory_synced", "install_ack"])("survives SIGKILL at amendment %s without skipping or replacing evidence", async (point) => {
    const p = await proposal(), input: MetricProcessInput = { action: "commit", manifest: f.original, proposal: p };
    expect((await start({ ...input, killPoint: point, killName: "amendment-000001.json" }).completed).signal).toBe("SIGKILL");
    const bytes = readFileSync(join(root, metricEvidencePath("amendment-000001.json")));
    const resumed = (await start(input).completed).response;
    if (["file_created", "file_partial"].includes(point)) expect(resumed).toHaveProperty("error");
    else expect(resumed).toMatchObject({ result: { ok: true, value: { sequence: 1 } } });
    expect(readFileSync(join(root, metricEvidencePath("amendment-000001.json")))).toEqual(bytes);
    expect(existsSync(join(root, "fetches.log"))).toBe(false);
  });
  it.each(["reservation", "fetch", "observation_partial", "observation_written", "observation_ack"])("never refetches after SIGKILL at %s", async (point) => {
    current(f.original.targets);
    const killPoint = point === "fetch" ? "fetch" : point === "observation_partial" ? "file_partial" : point === "observation_written" ? "file_written" : "install_ack";
    const input: MetricProcessInput = { action: "apply", manifest: f.original };
    expect((await start({ ...input, killPoint, killName: point === "reservation" ? "batch-0.reserved.json" : "batch-0.observed.json" }).completed).signal).toBe("SIGKILL");
    const resumed = (await start(input).completed).response;
    if (point === "observation_partial") expect(resumed).toHaveProperty("error");
    else expect(resumed).toMatchObject({ result: { ok: true, value: [{ status: point.startsWith("observation") ? "unavailable" : "uncertain" }] } });
    expect(existsSync(join(root, "fetches.log")) ? readFileSync(join(root, "fetches.log"), "utf8") : "").toBe(point === "reservation" ? "" : "fetch\n");
    await expect(f.receipts.withOperation((o) => resolveMetricOperation(o, metricRefreshDigest, f.clock.now(), true))).rejects.toThrow();
  });
});
