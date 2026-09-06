import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok } from "@social-monitor/shared-kernel";
import { manifest, now, target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";
import { metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { metricRefreshCells } from "./metric-refresh-report";
import { bindingFixture, earlier, later, observedPath, refreshedAuthority, resultPath, type BatchEvidence } from "./metric-refresh-result-binding.spec-support";
import type { MetricRefreshOutcome, PreservedMetricObservation } from "./refresh-retained-metrics.contracts";

describe("retained metric terminal result observation binding", () => {
  let root: string;
  let f: ReturnType<typeof bindingFixture>;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "metric-result-binding-")); f = bindingFixture(root); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("rejects a forged unavailable result for a valid preserved sample before inventory or effects", async () => {
    const project = jest.spyOn(f.projection, "project").mockRejectedValueOnce(new Error("lost projection acknowledgement"));
    const first = await f.usecase().execute(manifest());
    if (!first.ok) throw new Error(first.error);
    const path = `${manifest().evidencePath}/result-${target().sourceItemId}.json`;
    expect(await f.receipts.read(path)).toBeNull();
    const forged: MetricRefreshOutcome = { ...first.value[0]!, status: "unavailable", reason: null };
    await f.receipts.install(path, forged);
    f.inventory.list.mockClear(); f.inventory.read.mockClear(); f.fetcher.fetch.mockClear(); project.mockClear();

    await expect(f.usecase().execute(manifest())).rejects.toThrow("result_observation_mismatch");
    expect(f.inventory.list).not.toHaveBeenCalled();
    expect(f.inventory.read).not.toHaveBeenCalled();
    expect(f.fetcher.fetch).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
  });

  it.each<[string, (row: MetricRefreshOutcome) => MetricRefreshOutcome]>([
    ["failed with a valid sample", (row) => ({ ...row, status: "failed" })],
    ["projection exception persisted as terminal", (row) => ({ ...row, status: "failed", reason: "projection_unacknowledged_resume_same_operation" })],
    ["superseded at equal time", (row) => ({ ...row, status: "superseded" })],
    ["superseded by older authority", (row) => ({ ...row, status: "superseded", after: { ...row.after, observedAt: earlier, observationAt: earlier } })],
    ["superseded without a metrics hash", (row) => ({ ...row, status: "superseded", after: { ...row.after, observedAt: later, metricsHash: null } })],
    ["refreshed at an older time", (row) => ({ ...row, after: { ...row.after, observedAt: earlier, observationAt: earlier } })],
    ["refreshed at a later time", (row) => ({ ...row, after: { ...row.after, observedAt: later } })],
    ["refreshed with a different hash", (row) => ({ ...row, after: { ...row.after, metricsHash: "f".repeat(64) } })],
    ["refreshed with null hash", (row) => ({ ...row, after: { ...row.after, metricsHash: null } })],
    ["refreshed with null time", (row) => ({ ...row, after: { ...row.after, observedAt: null } })],
    ["refreshed with no cadence time", (row) => ({ ...row, after: { ...row.after, observationAt: null } })],
    ["cadence time after snapshot time", (row) => ({ ...row, after: { ...row.after, observationAt: later } })],
    ["returned flag differs", (row) => ({ ...row, returned: false })],
    ["reason differs", (row) => ({ ...row, reason: "omitted" })],
    ["observation time differs", (row) => ({ ...row, observedAt: earlier })],
    ["observation time missing", (row) => ({ ...row, observedAt: null })],
  ])("rejects %s before inventory, provider or projection", async (_name, mutate) => {
    const terminal = await f.captureTerminal();
    await f.receipts.install(resultPath, mutate(terminal));
    await f.rejectBeforeEffects("result_observation_mismatch");
  });

  it.each([
    ["unavailable", "refreshed"], ["unavailable", "superseded"],
    ["invalid_metrics", "refreshed"], ["invalid_metrics", "superseded"],
    ["batch_failure", "refreshed"], ["batch_failure", "superseded"],
  ] as const)("rejects %s claiming %s without a sample", async (kind, status) => {
    if (kind === "batch_failure") f.fetcher.fetch.mockResolvedValueOnce(err("provider_429_no_retry"));
    else f.fetcher.fetch.mockResolvedValueOnce(ok(kind === "unavailable" ? [] : [{ externalId: target().externalId,
      returned: true, reason: null, metadata: { kind: "reddit_post", score: 42, numComments: -1 } }]));
    const terminal = await f.captureTerminal();
    // Each claim has individually well-formed authority; its observation has no sample.
    const row = { ...terminal, status, after: { ...refreshedAuthority(), observedAt: status === "refreshed" ? now : later } };
    await f.receipts.install(resultPath, row);
    await f.rejectBeforeEffects("result_observation_mismatch");
  });

  it.each<[string, Partial<MetricRefreshOutcome>]>([
    ["unavailable status", { status: "unavailable" }],
    ["returned flag", { returned: true }],
    ["invented observation time", { observedAt: now }],
    ["different failure reason", { reason: "provider_fetch_failed_no_retry" }],
    ["missing failure reason", { reason: null }],
  ])("binds a failed batch to its exact %s", async (_name, change) => {
    f.fetcher.fetch.mockResolvedValueOnce(err("provider_429_no_retry"));
    const row = await f.captureTerminal();
    await f.receipts.install(resultPath, { ...row, ...change });
    await f.rejectBeforeEffects("result_observation_mismatch");
  });

  it.each(["unavailable", "failed"] as const)("rejects the wrong no-sample status for %s", async (status) => {
    f.fetcher.fetch.mockResolvedValueOnce(ok([{ externalId: target().externalId, returned: true,
      metadata: null, reason: status === "failed" ? "invalid_metrics" : "removed_deleted_or_hidden" }]));
    const row = await f.captureTerminal();
    expect(row.status).toBe(status);
    await f.receipts.install(resultPath, { ...row, status: status === "failed" ? "unavailable" : "failed" });
    await f.rejectBeforeEffects("result_observation_mismatch");
  });

  it("rejects uncertain as a persisted terminal status", async () => {
    const row = await f.captureTerminal();
    await f.receipts.install(resultPath, { ...row, status: "uncertain" });
    await f.rejectBeforeEffects("invalid_result_receipt");
  });

  it("rejects a self-consistent final report backed by an inconsistent result, even with reversed entries", async () => {
    const row = { ...await f.captureTerminal(), status: "unavailable" as const };
    await f.receipts.install(resultPath, row);
    await f.receipts.install(`${manifest().evidencePath}/final.json`, { manifestSha: metricRefreshDigest(manifest()),
      results: [row], cells: metricRefreshCells([row], manifest().scope.dates) });
    await f.rejectBeforeEffects("result_observation_mismatch", manifest(), true);
  });

  it.each<[string, (row: PreservedMetricObservation) => PreservedMetricObservation, string]>([
    ["valid metrics stripped of sample", (row) => ({ ...row, sample: null, reason: "omitted" }), "receipt_sample_mismatch"],
    ["sample metrics changed", (row) => ({ ...row, sample: { ...row.sample!, metrics: { score: 100 } } }), "receipt_sample_mismatch"],
    ["sample hash changed", (row) => ({ ...row, sample: { ...row.sample!, metricsFingerprint: "e".repeat(64) } }), "receipt_sample_mismatch"],
    ["sample target changed", (row) => ({ ...row, sample: { ...row.sample!, externalId: "reddit:t3_other" } }), "receipt_sample_mismatch"],
    ["sample time before planning", (row) => ({ ...row, observedAt: earlier }), "receipt_observation_time_invalid"],
    ["missing metadata and no normalized reason", (row) => ({ ...row, sample: null, metadata: null, reason: null }), "receipt_observation_mismatch"],
    ["invalid metadata and no normalized reason", (row) => ({ ...row, sample: null, metadata: { kind: "unknown" }, reason: null }), "receipt_observation_mismatch"],
  ])("rejects impossible normalized evidence: %s", async (_name, mutate, error) => {
    const install = f.install.getMockImplementation()!;
    f.install.mockImplementation(async (operation, path, value) => {
      if (path === observedPath) {
        const batch = value as BatchEvidence;
        await install(operation, path, { ...batch, observations: batch.observations.map(mutate) });
        throw new Error("interrupted_after_observation");
      }
      return install(operation, path, value);
    });
    await expect(f.usecase().execute(manifest())).rejects.toThrow("interrupted_after_observation");
    f.install.mockImplementation(install);
    await f.rejectBeforeEffects(error);
  });
});
