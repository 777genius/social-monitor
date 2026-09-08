import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { RefreshRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case";
import { AmendRetainedMetricManifestUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/amend-retained-metric-manifest.use-case";
import { metricRefreshCells } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-report";
import { fixture, manifest } from "./retained-metric-refresh.spec-support";
import { metricRefreshDigest as hash } from "./retained-metric-refresh-receipts";
import { implementation } from "./retained-metric-renewal.spec-support";

const sourcePath = "libs/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case.ts";
function reviewedBaseExecutor(): typeof RefreshRetainedMetricsUseCase {
  const source = execFileSync("git", ["show", `ad58aae7ca3e7fda6c705ee2d91b25388a78b374:${sourcePath}`], { encoding: "utf8" });
  const exports: Record<string, unknown> = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
  runInNewContext(compiled, { exports, require: (name: string) => jest.requireActual(name.startsWith(".") ? resolve(dirname(sourcePath), name) : name) });
  return exports.RefreshRetainedMetricsUseCase as typeof RefreshRetainedMetricsUseCase;
}
it.each([false, true])("preserves canonical v1 operation/proposal/amendment/effect/final bytes across extraction (amended=%s)", async (amended) => {
  const roots = [mkdtempSync(join(tmpdir(), "metric-base-bytes-")), mkdtempSync(join(tmpdir(), "metric-new-bytes-"))];
  try {
    const outputs = [];
    for (const [index, root] of roots.entries()) {
      const f = fixture(root), original = manifest();
      await f.receipts.install(`${original.evidencePath}/operation.json`, original);
      let effective = original;
      if (amended) {
        f.original.identityDigest = "d".repeat(64);
        const amend = new AmendRetainedMetricManifestUseCase(f.inventory, f.receipts, f.clock, hash, implementation);
        const proposal = await amend.prepare(hash(original), "TEST reviewed content version");
        if (!proposal.ok) throw new Error(proposal.error);
        const committed = await amend.commit(hash(proposal.value), hash(original), proposal.value.effectiveManifestSha);
        if (!committed.ok) throw new Error(committed.error);
        effective = committed.value.effective;
      }
      const Executor = index === 0 ? reviewedBaseExecutor() : RefreshRetainedMetricsUseCase;
      const usecase = new Executor(f.inventory, f.fetcher, f.projection, f.receipts, f.clock, hash);
      const result = await usecase.execute(effective);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      await f.receipts.install(`${effective.evidencePath}/final.json`, { manifestSha: hash(effective), results: result.value, cells: metricRefreshCells(result.value, effective.scope.dates) });
      const files = () => readdirSync(join(root, effective.evidencePath)).sort().map((name) => [name, readFileSync(join(root, effective.evidencePath, name)).toString("hex")]);
      const before = files();
      expect(await usecase.execute(effective)).toEqual(result);
      expect(files()).toEqual(before);
      outputs.push({ result, files: before });
    }
    expect(outputs[1]).toEqual(outputs[0]);
  } finally { for (const root of roots) rmSync(root, { recursive: true, force: true }); }
});
