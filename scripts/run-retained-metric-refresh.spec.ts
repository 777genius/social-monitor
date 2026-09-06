import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SystemClock } from "@social-monitor/shared-kernel";
import * as persistence from "@social-monitor/platform-persistence";
import * as prismaRuntime from "@social-monitor/platform-persistence/prisma-runtime-client";
import { PrismaRetainedMetricInventory } from "@social-monitor/ingestion/adapters/persistence/prisma-retained-metric-inventory";
import * as projectionModule from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import { RetainedMetricFetchAdapter } from "@social-monitor/ingestion/adapters/source/retained-metric-fetch.capability";
import * as receiptModule from "./lib/retained-metric-refresh-receipts";
import * as maintenanceModule from "./lib/retained-metric-maintenance";
import { incidentFixture, implementation } from "./lib/retained-metric-amendment.spec-support";
import { metricEvidencePath } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-amendment";
import { runRetainedMetricRefresh } from "./run-retained-metric-refresh";

jest.mock("@social-monitor/platform-persistence", () => ({
  ...jest.requireActual<typeof persistence>("@social-monitor/platform-persistence"),
  acquirePrismaPgRuntimeConnection: jest.fn(),
}));

jest.setTimeout(60_000);
describe("retained metric CLI composition and effective sample guard", () => {
  let root: string, f: ReturnType<typeof incidentFixture>, output: string;
  const sha = receiptModule.metricRefreshDigest;
  const run = (...args: string[]) => runRetainedMetricRefresh(["--operation-id", f.original.operationId,
    "--source-sha", implementation.sourceSha, "--executable-sha", implementation.executableSha,
    "--legacy-retirement-ref", implementation.legacyRetirementRef, ...args],
    { METRIC_REFRESH_DATABASE_URL: "postgresql://fixture@127.0.0.1/metric_refresh_test_cli" });
  beforeEach(async () => {
    jest.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), "metric-cli-")); f = incidentFixture(root, 3); output = "";
    await f.receipts.install(metricEvidencePath("operation.json"), f.original);
    jest.spyOn(SystemClock.prototype, "now").mockImplementation(() => f.clock.now());
    jest.spyOn(process.stdout, "write").mockImplementation((bytes) => { output += String(bytes); return true; });
    jest.spyOn(maintenanceModule, "metricMaintenanceAdmission").mockReturnValue({ implementation,
      holder: { pid: 1, startTicks: "1", locks: [] }, assertHeld: () => {} });
    jest.spyOn(receiptModule, "SecureMetricRefreshReceipts").mockImplementation(() => f.receipts);
    jest.spyOn(persistence, "acquirePrismaPgRuntimeConnection").mockResolvedValue({ client: {}, close: async () => {} } as never);
    jest.spyOn(prismaRuntime, "loadPrismaRuntimeClient").mockReturnValue(class {} as never);
    jest.spyOn(PrismaRetainedMetricInventory.prototype, "list").mockImplementation(f.inventory.list);
    jest.spyOn(PrismaRetainedMetricInventory.prototype, "read").mockImplementation(f.inventory.read);
    jest.spyOn(RetainedMetricFetchAdapter.prototype, "fetch").mockResolvedValue({ ok: true, value: [] });
    jest.spyOn(projectionModule, "PrismaSourceEngagementProjectionAdapter").mockImplementation(() => ({ project: jest.fn() }) as never);
  });
  afterEach(() => { jest.restoreAllMocks(); process.exitCode = 0; rmSync(root, { recursive: true, force: true }); });
  it("keeps dry-run inventory complete, then review/commit spend no provider/projection calls", async () => {
    await run();
    expect(JSON.parse(output)).toMatchObject({ mode: "dry-run", problem: "inventory_drift", currentTargets: f.current() });
    expect(f.inventory.list).toHaveBeenCalledTimes(1); output = "";
    await run("--prepare-amendment", "--prior-manifest-sha", sha(f.original), "--reason", "TEST exact content review");
    const prepared = JSON.parse(output); expect(prepared.result.ok).toBe(true); output = "";
    await run("--commit-amendment", prepared.amendmentSha, "--prior-manifest-sha", sha(f.original),
      "--effective-manifest-sha", prepared.result.value.effectiveManifestSha);
    expect(JSON.parse(output).result.ok).toBe(true);
    expect(RetainedMetricFetchAdapter.prototype.fetch).not.toHaveBeenCalled();
    expect(projectionModule.PrismaSourceEngagementProjectionAdapter).not.toHaveBeenCalled();
  });
  it("rejects old apply SHA before database acquisition and uses effective identity inside the transaction", async () => {
    const prepared = await f.amendment().prepare(sha(f.original), "TEST reviewed amendment");
    if (!prepared.ok) throw new Error(prepared.error);
    const p = prepared.value;
    expect((await f.amendment().commit(sha(p), p.priorEffectiveSha, p.effectiveManifestSha)).ok).toBe(true);
    await expect(run("--apply", "--manifest-sha", sha(f.original))).rejects.toThrow("SHA mismatch");
    expect(persistence.acquirePrismaPgRuntimeConnection).not.toHaveBeenCalled();
    f.inventory.list.mockClear();
    await run("--apply", "--manifest-sha", p.effectiveManifestSha);
    const report = JSON.parse(output);
    expect(report.manifestSha).toBe(p.effectiveManifestSha);
    expect(report.results).toHaveLength(3); expect(report.cells).toHaveLength(14);
    expect(report.results.every((r: { status: string }) => r.status === "unavailable")).toBe(true);
    expect(f.inventory.list).toHaveBeenCalledTimes(1);
    const options = jest.mocked(projectionModule.PrismaSourceEngagementProjectionAdapter).mock.calls[0]![2]!;
    const sample = { sourceItemId: f.current()[0]!.sourceItemId };
    await expect(options.sampleGuard!({} as never, {} as never, sample as never)).resolves.toBeUndefined();
    f.change([...f.original.targets]);
    await expect(options.sampleGuard!({} as never, {} as never, sample as never)).rejects.toThrow("Transactional target drift");
    expect(await f.receipts.read(metricEvidencePath("final.json"))).toEqual(report);
  });
});
