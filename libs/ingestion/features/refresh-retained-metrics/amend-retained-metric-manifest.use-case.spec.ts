import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok } from "@social-monitor/shared-kernel";
import { incidentFixture, independentMetricSha, incidentSource, afterDigest, beforeDigest, implementation } from "../../../../scripts/lib/retained-metric-amendment.spec-support";
import { canonicalMetricRefreshJson, metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { refreshBatches, sameTarget } from "./metric-refresh-admission";
import { metricEvidencePath, metricProposalName, resolveMetricOperation } from "./metric-refresh-amendment";
import { AmendRetainedMetricManifestUseCase } from "./amend-retained-metric-manifest.use-case";
import { RefreshRetainedMetricsUseCase } from "./refresh-retained-metrics.use-case";
import type { MetricManifestAmendment } from "./metric-refresh-operation.contracts";

jest.setTimeout(60_000);
describe("explicit pre-reservation retained metric content amendment", () => {
  let root: string, f: ReturnType<typeof incidentFixture>;
  beforeEach(async () => { root = mkdtempSync(join(tmpdir(), "metric-amendment-")); f = incidentFixture(root, 3); await f.receipts.install(metricEvidencePath("operation.json"), f.original); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const amend = () => new AmendRetainedMetricManifestUseCase(f.inventory, f.receipts, f.clock, metricRefreshDigest, implementation);
  const prepare = async (): Promise<MetricManifestAmendment> => {
    const result = await amend().prepare(metricRefreshDigest(f.original), "Reviewed natural content version");
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const commit = (p: MetricManifestAmendment) => amend().commit(metricRefreshDigest(p), p.priorEffectiveSha, p.effectiveManifestSha);
  it("reproduces the 3329-ID incident, preserves original bytes/baselines, and spends no effects during review/commit", async () => {
    rmSync(root, { recursive: true }); root = mkdtempSync(join(tmpdir(), "metric-3329-")); f = incidentFixture(root);
    await f.receipts.install(metricEvidencePath("operation.json"), f.original);
    const bytes = readFileSync(join(root, metricEvidencePath("operation.json")));
    const fetcher = { fetch: jest.fn(async () => ok([])) }, projection = { project: jest.fn(async () => { throw new Error("No projection expected"); }) };
    const apply = () => new RefreshRetainedMetricsUseCase(f.inventory, fetcher, projection, f.receipts, f.clock, metricRefreshDigest);
    expect(await apply().execute(f.original)).toEqual({ ok: false, error: "inventory_drift" });
    const proposal = await prepare();
    expect(proposal.changes).toEqual([{ sourceItemId: incidentSource, before: beforeDigest, after: afterDigest }]);
    expect(proposal.inventorySha).toBe(independentMetricSha(proposal.inventory));
    expect(metricRefreshDigest(proposal)).toBe(independentMetricSha(proposal));
    const committed = await commit(proposal); expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const effective = committed.value.effective;
    expect(effective).toEqual({ ...f.original, targets: f.original.targets.map((t) => ({ ...t, identityDigest: t.sourceItemId === incidentSource ? afterDigest : t.identityDigest })) });
    expect(proposal.effectiveManifestSha).toBe(independentMetricSha(effective));
    expect(refreshBatches(effective.targets).flat().map((t) => t.sourceItemId).sort()).toEqual(f.original.targets.map((t) => t.sourceItemId).sort());
    expect(effective.targets).toHaveLength(3329);
    expect(readFileSync(join(root, metricEvidencePath("operation.json")))).toEqual(bytes);
    expect(await apply().execute(f.original)).toEqual({ ok: false, error: "reviewed_manifest_sha_mismatch" });
    expect(await apply().execute(effective, "0".repeat(64))).toEqual({ ok: false, error: "reviewed_manifest_sha_mismatch" });
    expect(fetcher.fetch).not.toHaveBeenCalled(); expect(projection.project).not.toHaveBeenCalled();
    expect(await f.receipts.read(metricEvidencePath("batch-0.reserved.json"))).toBeNull();
    expect(await commit(proposal)).toEqual(committed);
  });
  it("records fresh authority separately while original before authority and effective identity stay fixed", async () => {
    f.change(f.current().map((t) => ({ ...t, authority: { ...t.authority, observationCount: 5 } })));
    const proposal = await prepare();
    f.change(f.current().map((t) => ({ ...t, authority: { ...t.authority, observationCount: 6 } })));
    const result = await commit(proposal); expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.effective.targets[0]!.authority.observationCount).toBe(0);
      expect(proposal.inventory[0]!.authority.observationCount).toBe(5);
      expect(sameTarget(result.value.effective.targets[0]!, f.current()[0]!, metricRefreshDigest)).toBe(true);
    }
  });
  it.each(["added", "removed", "duplicate", "configDigest", "feedDigest", "sourceBindingId", "canonicalUrl", "publishedAt", "providerKey", "rejection", "visibleFeedCount", "tenantId"])("rejects full-inventory %s drift", async (field) => {
    const rows = structuredClone(f.current());
    if (field === "added") rows.push({ ...rows[1]!, sourceItemId: "00000000-0000-7000-8000-000000009999" });
    else if (field === "removed") rows.pop();
    else if (field === "duplicate") rows.push(rows[0]!);
    else Object.assign(rows[0]!, { [field]: field.endsWith("Digest") ? "e".repeat(64) : field === "visibleFeedCount" ? 2 : "changed" });
    f.change(rows);
    await expect(prepare()).rejects.toThrow();
    expect((await f.receipts.withOperation((o) => o.entries())).map((e) => e.name)).toEqual(["operation.json", "operation.lock"]);
  });
  it("rejects source drift after review and wrong review/effective/parent hashes without committing", async () => {
    const p = await prepare();
    expect(await amend().commit("0".repeat(64), p.priorEffectiveSha, p.effectiveManifestSha)).toEqual({ ok: false, error: "missing_amendment_review" });
    expect(await amend().commit(metricRefreshDigest(p), "0".repeat(64), p.effectiveManifestSha)).toEqual({ ok: false, error: "reviewed_sha_mismatch" });
    expect(await amend().commit(metricRefreshDigest(p), p.priorEffectiveSha, "0".repeat(64))).toEqual({ ok: false, error: "reviewed_sha_mismatch" });
    f.change(f.current().map((t, i) => i === 1 ? { ...t, identityDigest: "e".repeat(64) } : t));
    expect(await commit(p)).toEqual({ ok: false, error: "inventory_drift" });
    expect(await f.receipts.read(metricEvidencePath("amendment-000001.json"))).toBeNull();
  });
  it.each(["batch-9999.reserved.json", "batch-2.observed.json", `result-${incidentSource}.json`, "final.json", "unknown.json"])("never interprets orphan/unknown %s as zero budget", async (name) => {
    const p = await prepare();
    writeFileSync(join(root, metricEvidencePath(name)), "{}", { mode: 0o400 });
    await expect(commit(p)).rejects.toThrow();
  });
  it("allows a second individually reviewed head only before any reservation, then freezes all heads permanently", async () => {
    const p = await prepare(); const first = await commit(p); expect(first.ok).toBe(true);
    f.change(f.current().map((t, i) => i === 0 ? { ...t, identityDigest: "e".repeat(64) } : t));
    const next = await amend().prepare(p.effectiveManifestSha, "Second separately reviewed content version");
    expect(next.ok).toBe(true); if (!next.ok) return;
    const accepted = await commit(next.value); expect(accepted.ok).toBe(true); if (!accepted.ok) return;
    expect(await commit(p)).toEqual({ ok: false, error: "stale_amendment_head" });
    const effective = accepted.value.effective;
    const fetcher = { fetch: jest.fn(async () => { throw new Error("crash before fetch"); }) };
    const usecase = new RefreshRetainedMetricsUseCase(f.inventory, fetcher, { project: jest.fn() }, f.receipts, f.clock, metricRefreshDigest);
    await expect(usecase.execute(effective)).rejects.toThrow("crash before fetch");
    await expect(commit(next.value)).rejects.toThrow("metric_budget_already_started");
    const resumed = await usecase.execute(effective);
    expect(resumed.ok && resumed.value.map((row) => row.status)).toEqual(["uncertain", "uncertain", "uncertain"]);
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
  });
  it("binds apply/reservation/results to effective SHA and rechecks the full inventory once plus every new batch", async () => {
    const p = await prepare(), result = await commit(p); if (!result.ok) throw new Error(result.error);
    f.inventory.list.mockClear();
    const fetcher = { fetch: jest.fn(async () => ok([])) };
    const usecase = new RefreshRetainedMetricsUseCase(f.inventory, fetcher, { project: jest.fn() }, f.receipts, f.clock, metricRefreshDigest);
    expect(await usecase.execute(result.value.effective)).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ manifestSha: p.effectiveManifestSha, status: "unavailable" })]) });
    expect(f.inventory.list).toHaveBeenCalledTimes(1);
    expect(await f.receipts.read(metricEvidencePath("batch-0.reserved.json"))).toMatchObject({ manifestDigest: p.effectiveManifestSha });
    await expect(amend().prepare(p.effectiveManifestSha, "Never after budget")).rejects.toThrow("metric_budget_already_started");
  });
  it("rejects corrupted amendment chain and modified proposal inventory/diff despite a valid envelope hash", async () => {
    const p = await prepare();
    const wrong = { ...p, changes: [{ ...p.changes[0]!, after: "0".repeat(64) }] };
    await f.receipts.install(metricEvidencePath(metricProposalName(metricRefreshDigest(wrong))), wrong);
    await expect(f.receipts.withOperation((o) => resolveMetricOperation(o, metricRefreshDigest, f.clock.now(), true))).rejects.toThrow("unreviewed_content_diff");
  });
  it.each(["gap", "original_baseline", "missing_proposal"])("refuses %s after commit without fallback to the original head", async (kind) => {
    const p = await prepare(); expect((await commit(p)).ok).toBe(true);
    if (kind === "gap") renameSync(join(root, metricEvidencePath("amendment-000001.json")), join(root, metricEvidencePath("amendment-000002.json")));
    else if (kind === "missing_proposal") unlinkSync(join(root, metricEvidencePath(metricProposalName(metricRefreshDigest(p)))));
    else {
      const original = { ...f.original, targets: f.original.targets.map((t) => ({ ...t, authority: { ...t.authority, observationCount: 1 } })) };
      const path = join(root, metricEvidencePath("operation.json"));
      chmodSync(path, 0o600); writeFileSync(path, canonicalMetricRefreshJson({ digest: metricRefreshDigest(original), value: original })); chmodSync(path, 0o400);
    }
    await expect(f.receipts.withOperation((o) => resolveMetricOperation(o, metricRefreshDigest, f.clock.now()))).rejects.toThrow();
  });
  it("bounds reviewed head/proposal history without manufacturing a reset or further budget", async () => {
    let prior = metricRefreshDigest(f.original);
    for (let i = 1; i <= 8; i++) {
      f.change(f.current().map((t, index) => index === 0 ? { ...t, identityDigest: String(i).repeat(64) } : t));
      const prepared = await amend().prepare(prior, `Review ${i}`); expect(prepared.ok).toBe(true);
      if (!prepared.ok) throw new Error(prepared.error);
      const accepted = await commit(prepared.value); expect(accepted.ok).toBe(true);
      prior = prepared.value.effectiveManifestSha;
    }
    expect(await amend().prepare(prior, "One beyond the bound")).toEqual({ ok: false, error: "amendment_limit" });
    expect(await f.receipts.read(metricEvidencePath("batch-0.reserved.json"))).toBeNull();
  });
});
