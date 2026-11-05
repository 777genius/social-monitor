import { runRetainedMetricRenewal } from "./run-retained-metric-renewal";
import { acquirePrismaPgRuntimeConnection, defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";
import { metricMaintenanceAdmission } from "./lib/retained-metric-maintenance";
import { retainedMetricRenewalReceipts } from "./lib/retained-metric-renewal-receipts";
import { resolveMetricRenewal } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal-evidence";
import { metricRefreshDigest as hash } from "./lib/retained-metric-refresh-receipts";
import { metricRenewalCells } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal-report";
import type { MetricRenewalManifest } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal.contracts";
import { implementation } from "./lib/retained-metric-renewal.spec-support";
import type { MetricRefreshOperation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import { PrismaRetainedMetricInventory } from "@social-monitor/ingestion/adapters/persistence/prisma-retained-metric-inventory";
import { target } from "./lib/retained-metric-refresh.spec-support";

jest.mock("@social-monitor/platform-persistence", () => ({ acquirePrismaPgRuntimeConnection: jest.fn(), defaultPostgresRuntimePoolConfig: jest.fn(), runWithTenantDatabaseAccess: jest.fn() }));
jest.mock("@social-monitor/platform-persistence/prisma-runtime-client", () => ({ loadPrismaRuntimeClient: jest.fn() }));
jest.mock("./lib/retained-metric-maintenance", () => ({ metricMaintenanceAdmission: jest.fn() }));
jest.mock("./lib/retained-metric-renewal-receipts", () => ({ retainedMetricRenewalReceipts: jest.fn() }));
jest.mock("@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal-evidence", () => ({ resolveMetricRenewal: jest.fn() }));
jest.mock("@social-monitor/ingestion/adapters/persistence/prisma-retained-metric-inventory", () => ({ PrismaRetainedMetricInventory: jest.fn() }));
const order: string[] = [];
const operation = { assertHeld: jest.fn(), read: jest.fn(), install: jest.fn(), entries: jest.fn() };
const manifest = { capture: { implementation, lateArrivalSourceItemIds: [] }, predecessor: { originalSourceItemIds: [target().sourceItemId] },
  scope: { dates: ["2026-09-04"] }, targets: [target()] } as unknown as MetricRenewalManifest;
beforeEach(() => {
  jest.clearAllMocks(); order.length = 0;
  jest.mocked(metricMaintenanceAdmission).mockReturnValue({ implementation, holder: { pid: 1, startTicks: "1", locks: [] }, assertHeld: jest.fn() } as ReturnType<typeof metricMaintenanceAdmission>);
  const authority = (name: string) => ({ withOperation: async <T>(work: (o: MetricRefreshOperation) => Promise<T>) => { order.push(name); return work(operation); } });
  jest.mocked(retainedMetricRenewalReceipts).mockReturnValue({ predecessor: authority("predecessor"), renewal: authority("renewal") } as ReturnType<typeof retainedMetricRenewalReceipts>);
  jest.mocked(resolveMetricRenewal).mockResolvedValue(manifest);
  operation.read.mockResolvedValue({ manifestSha: hash(manifest), results: [], cells: metricRenewalCells([], manifest.scope.dates) });
});
afterEach(() => jest.restoreAllMocks());
it.each([["--apply", "--resume"], ["--apply"], ["--prepare", "--date", "2026-09-04"], ["--prepare", "--path", "/tmp/alternate"],
  ["--prepare", "--operation-id", "arbitrary"], ["--repeat"], ["--resume", "--manifest-sha", "invalid"]])("rejects closed CLI options %j before DB construction", async (...args) => {
  await expect(runRetainedMetricRenewal(args, {})).rejects.toThrow();
  expect(metricMaintenanceAdmission).not.toHaveBeenCalled(); expect(loadPrismaRuntimeClient).not.toHaveBeenCalled();
});
it.each(["sha", "release"])("refuses changed installed %s before DB construction", async (kind) => {
  if (kind === "release") jest.mocked(resolveMetricRenewal).mockResolvedValue({ ...manifest, capture: { ...manifest.capture,
    implementation: { ...implementation, sourceSha: "f".repeat(64) } } });
  const installed = kind === "release"
    ? { ...manifest, capture: { ...manifest.capture, implementation: { ...implementation, sourceSha: "f".repeat(64) } } } : manifest;
  await expect(runRetainedMetricRenewal(["--apply", "--manifest-sha", kind === "sha" ? "f".repeat(64) : hash(installed)], {})).rejects.toThrow(kind === "sha" ? /SHA mismatch/ : /release changed/);
  expect(loadPrismaRuntimeClient).not.toHaveBeenCalled(); expect(acquirePrismaPgRuntimeConnection).not.toHaveBeenCalled();
});
it.each(["--apply", "--resume", "--prepare"])("replays terminal %s under predecessor then renewal locks with no DB or installs", async (mode) => {
  const output = jest.spyOn(process.stdout, "write").mockReturnValue(true);
  await runRetainedMetricRenewal([mode, ...(mode === "--prepare" ? [] : ["--manifest-sha", hash(manifest)])], {});
  expect(order).toEqual(["predecessor", "renewal"]);
  expect(output).toHaveBeenCalledTimes(1); expect(operation.install).not.toHaveBeenCalled();
  expect(defaultPostgresRuntimePoolConfig).not.toHaveBeenCalled(); expect(loadPrismaRuntimeClient).not.toHaveBeenCalled();
});
it("captures a separately timed diagnostic late-arrival audit without installing or altering the frozen grant", async () => {
  const late = target({ sourceItemId: "outside-grant" });
  jest.mocked(PrismaRetainedMetricInventory).mockImplementation(() => ({ list: jest.fn().mockResolvedValueOnce([target(), late]).mockResolvedValueOnce([target()]) }) as unknown as PrismaRetainedMetricInventory);
  const close = jest.fn();
  jest.mocked(acquirePrismaPgRuntimeConnection).mockResolvedValue({ client: {}, close } as never);
  jest.mocked(runWithTenantDatabaseAccess).mockImplementation(async (_scope, work) => work());
  const output = jest.spyOn(process.stdout, "write").mockReturnValue(true);
  await runRetainedMetricRenewal(["--diagnostic"], {});
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({ diagnostic: true, manifestSha: hash(manifest),
    captureStartedAt: expect.any(String), captureCompletedAt: expect.any(String), outsideGrantSourceItemIds: [late.sourceItemId] });
  expect(operation.install).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});
it("keeps original and late-arrival authority references separate in terminal CLI reporting", async () => {
  const before = { ...target().authority, metricsHash: "a".repeat(64), observedAt: "2026-09-08T11:00:00.000Z",
    observationAt: "2026-09-08T10:00:00.000Z", observationCount: 1 };
  const results = [target().sourceItemId, "late-source"].map((sourceItemId, i) => ({ sourceItemId, externalId: `reddit:t3_fixture${i}`,
    providerKey: "reddit" as const, date: "2026-09-04", status: i ? "superseded" as const : "refreshed" as const,
    returned: true, reason: null, observedAt: "2026-09-08T12:00:00.000Z", before,
    after: { ...before, metricsHash: i ? "b".repeat(64) : before.metricsHash, observedAt: i ? "2026-09-08T12:01:00.000Z" : "2026-09-08T12:00:00.000Z" } }));
  const installed = { ...manifest, capture: { ...manifest.capture, lateArrivalSourceItemIds: ["late-source"] } };
  jest.mocked(resolveMetricRenewal).mockResolvedValue(installed);
  operation.read.mockResolvedValue({ manifestSha: hash(installed), results, cells: metricRenewalCells(results, manifest.scope.dates) });
  const output = jest.spyOn(process.stdout, "write").mockReturnValue(true);
  await runRetainedMetricRenewal(["--resume", "--manifest-sha", hash(installed)], {});
  const report = JSON.parse(String(output.mock.calls[0]![0]));
  for (const [i, cohort] of ["originals", "lateArrivals"].entries()) {
    expect(report.cohorts[cohort].count).toBe(1);
    expect(report.cohorts[cohort].cells[1].authorities).toEqual([{ sourceItemId: results[i]!.sourceItemId,
      externalId: results[i]!.externalId, observedAt: results[i]!.observedAt, before, after: results[i]!.after }]);
  }
  expect(acquirePrismaPgRuntimeConnection).not.toHaveBeenCalled();
});
