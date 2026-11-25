import { fixture, manifest, now, scope, target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";
import { metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { buildSourceEngagementMetrics } from "../../domain";
import { RefreshRetainedMetricsUseCase } from "./refresh-retained-metrics.use-case";
import type { MetricRefreshManifest, MetricRefreshOutcome, PreservedMetricObservation, RetainedMetricFetchCapability } from "./refresh-retained-metrics.contracts";

export const resultPath = `${manifest().evidencePath}/result-${target().sourceItemId}.json`;
export const observedPath = `${manifest().evidencePath}/batch-0.observed.json`;
export const later = "2026-09-05T13:00:00.000Z";
export const earlier = "2026-09-05T11:00:00.000Z";
export type BatchEvidence = { observations: PreservedMetricObservation[]; failure: string | null };

export function bindingFixture(root: string) {
  const f = fixture(root);
  // The shared success fixture infers Ok only; exercise the full capability's
  // Result contract on the same mock used by its writer.
  const fetcher = f.fetcher as { fetch: jest.Mock<ReturnType<RetainedMetricFetchCapability["fetch"]>, []> };
  const project = jest.spyOn(f.projection, "project");
  const clearEffects = () => {
    f.inventory.list.mockClear(); f.inventory.read.mockClear(); f.fetcher.fetch.mockClear(); project.mockClear(); f.install.mockClear();
  };
  const expectNoEffects = () => {
    expect(f.inventory.list).not.toHaveBeenCalled(); expect(f.inventory.read).not.toHaveBeenCalled();
    expect(f.fetcher.fetch).not.toHaveBeenCalled(); expect(project).not.toHaveBeenCalled(); expect(f.install).not.toHaveBeenCalled();
  };
  const usecaseWithOrder = () => new RefreshRetainedMetricsUseCase(f.inventory, f.fetcher, f.projection, {
    read: f.receipts.read.bind(f.receipts), install: f.receipts.install.bind(f.receipts),
    withOperation: (work) => f.receipts.withOperation((operation) => work({ ...operation,
      entries: async () => [...await operation.entries()].sort((a, b) => b.name.localeCompare(a.name)),
    })),
  }, f.clock, metricRefreshDigest);
  const rejectBeforeEffects = async (error: string, planned = manifest(), reversed = false) => {
    clearEffects();
    await expect((reversed ? usecaseWithOrder() : f.usecase()).execute(planned)).rejects.toThrow(error);
    expectNoEffects();
  };
  const captureTerminal = async (planned: MetricRefreshManifest = manifest()) => {
    const install = f.install.getMockImplementation()!;
    let terminal: MetricRefreshOutcome | undefined;
    f.install.mockImplementation(async (operation, path, value) => {
      if (path.includes("/result-")) { terminal = value as MetricRefreshOutcome; throw new Error("interrupted_result_install"); }
      return install(operation, path, value);
    });
    await expect(f.usecase().execute(planned)).rejects.toThrow("interrupted_result_install");
    f.install.mockImplementation(install);
    if (!terminal) throw new Error("Writer did not reach a terminal result");
    expect(await f.receipts.read(resultPath)).toBeNull();
    return terminal;
  };
  const projectNatural = async (observedAt = later, score = 99) => {
    const built = buildSourceEngagementMetrics({ providerKey: "reddit", metadata: { kind: "reddit_post", score, numComments: 9 } });
    await f.projection.project({ tenantId: scope.tenantId as never, workspaceId: scope.workspaceId as never,
      sourceBindingId: target().sourceBindingId, scanJobId: manifest().operationId, providerKey: "reddit", observedAt: new Date(observedAt),
      samples: [{ sourceItemId: target().sourceItemId, externalId: target().externalId, publishedAt: new Date(target().publishedAt),
        metrics: built.metrics!, metricsFingerprint: built.metricsFingerprint!, providerMetadataPatch: built.providerMetadataPatch, refreshReadModels: true }] });
  };
  const assertReplay = async (planned = manifest(), reversed = false) => {
    const terminal = await f.receipts.read<MetricRefreshOutcome>(resultPath);
    expect(terminal).not.toBeNull();
    const fetches = f.fetcher.fetch.mock.calls.length, projections = project.mock.calls.length;
    const resumed = await (reversed ? usecaseWithOrder() : f.usecase()).execute(planned);
    expect(resumed).toEqual({ ok: true, value: [terminal] });
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(fetches); expect(project).toHaveBeenCalledTimes(projections);
    expect(await f.receipts.read(resultPath)).toEqual(terminal);
    return terminal!;
  };
  return { ...f, fetcher, project, clearEffects, expectNoEffects, rejectBeforeEffects, captureTerminal, projectNatural, assertReplay, usecaseWithOrder };
}

export const refreshedAuthority = () => {
  const built = buildSourceEngagementMetrics({ providerKey: "reddit", metadata: { kind: "reddit_post", score: 42, numComments: 9 } });
  return { metricsHash: built.metricsFingerprint!, observedAt: now, observationAt: now, observationCount: 1, regressionCount: 0 };
};
