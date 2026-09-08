import childProcess from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { RefreshRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case";
import { createHash } from "node:crypto";
import { cpSync, chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fixture } from "./retained-metric-refresh.spec-support";
import { metricRefreshDigest as hash } from "./retained-metric-refresh-receipts";
import { resolveMetricOperation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-amendment";
import { assertMetricManifest } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-evidence-validation";
import { metricRefreshEvidencePath } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import type { MetricRefreshOutcome } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
const legacySourcePath = resolve(__dirname, "../test-fixtures/retained-metric-legacy/refresh-retained-metrics.ad58aae7.ts.txt");
// Independently pinned original Git blob bytes; never regenerate from the current executor.
const legacySourceSha256 = "4ed041799c2c43aeef326364dd86cad33fb6293b9b7b2a6781bb5086134740bf";
function oldExecutor(): typeof RefreshRetainedMetricsUseCase {
  const path = "libs/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case.ts";
  const bytes = readFileSync(legacySourcePath);
  if (bytes.length !== 10251 || createHash("sha256").update(bytes).digest("hex") !== legacySourceSha256) {
    throw new Error("Legacy executor fixture integrity mismatch");
  }
  const source = bytes.toString("utf8");
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText,
    { exports, require: (name: string) => jest.requireActual(name.startsWith(".") ? resolve(dirname(path), name) : name) });
  return exports.RefreshRetainedMetricsUseCase as typeof RefreshRetainedMetricsUseCase;
}
beforeEach(() => {
  jest.spyOn(childProcess, "execFileSync").mockImplementation(() => { throw new Error("Git history unavailable"); });
});
afterEach(() => { jest.restoreAllMocks(); });
it("refuses mutated legacy source bytes before execution", () => {
  const mutated = Buffer.from(readFileSync(legacySourcePath));
  mutated[0] = mutated[0]! ^ 1;
  const read = fs.readFileSync;
  jest.spyOn(fs, "readFileSync").mockImplementation((...args: Parameters<typeof read>) =>
    args[0] === legacySourcePath ? mutated : read(...args));
  const execute = jest.spyOn(vm, "runInNewContext");
  expect(() => oldExecutor()).toThrow("Legacy executor fixture integrity mismatch");
  expect(execute).not.toHaveBeenCalled();
});
const corpus = resolve("test-fixtures/retained-metric-legacy/canonical");
const expected = JSON.parse(readFileSync(join(corpus, "hashes.json"), "utf8")) as Record<string, { bytesSha: string; payloadSha: string | null }>;
it.each(["sequence-zero", "amended"])("loads fixed canonical %s original/chain/effects/final bytes without rewriting or refetch", async (kind) => {
  const root = mkdtempSync(join(tmpdir(), "renewal-canonical-"));
  try {
    const path = join(root, metricRefreshEvidencePath);
    cpSync(join(corpus, kind), path, { recursive: true });
    chmodSync(join(root, "seven-day-6101-6102"), 0o700); chmodSync(path, 0o700);
    const bytes = () => readdirSync(path).sort().map((name) => [name, readFileSync(join(path, name)).toString("hex")]);
    for (const name of readdirSync(path)) {
      chmodSync(join(path, name), 0o400);
      const data = readFileSync(join(path, name)), pinned = expected[`${kind}/${name}`]!;
      expect(createHash("sha256").update(data).digest("hex")).toBe(pinned.bytesSha);
      if (name !== "operation.lock") {
        const envelope = JSON.parse(data.toString());
        expect(envelope.digest).toBe(pinned.payloadSha); expect(hash(envelope.value)).toBe(pinned.payloadSha);
      }
    }
    const f = fixture(root);
    const head = await f.receipts.withOperation((o) => resolveMetricOperation(o, hash, f.clock.now()));
    expect(head?.sequence).toBe(kind === "amended" ? 1 : 0);
    if (!head) throw new Error("missing fixture head");
    Object.assign(f.original, head.effective.targets[0]);
    const final = await f.receipts.read<{ results: MetricRefreshOutcome[] }>(`${metricRefreshEvidencePath}/final.json`);
    expect(final!.results.every((r) => kind === "amended" ? r.manifestSha === hash(head.effective) : r.manifestSha === undefined)).toBe(true);
    const before = bytes();
    for (const Executor of [oldExecutor(), RefreshRetainedMetricsUseCase]) {
      const run = new Executor(f.inventory, f.fetcher, f.projection, f.receipts, f.clock, hash);
      expect(await run.execute(head.effective)).toEqual({ ok: true, value: final!.results });
      expect(await run.execute({ ...head.original, version: "retained-metrics-renewal.v1" } as never)).toMatchObject({ ok: false });
    }
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
    expect(bytes()).toEqual(before); expect(f.fetcher.fetch).not.toHaveBeenCalled();
    expect(f.db.rows("sourceItemEngagementObservation")).toHaveLength(0);
    expect(() => assertMetricManifest({ ...head.original, version: "retained-metrics-renewal.v1" }, f.clock.now())).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
