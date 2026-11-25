import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok, type Result } from "@social-monitor/shared-kernel";
import { incidentFixture, afterDigest } from "../../../../scripts/lib/retained-metric-amendment.spec-support";
import { metricRefreshDigest as sha } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { metricEvidencePath, resolveMetricOperation } from "./metric-refresh-amendment";
import { RefreshRetainedMetricsUseCase } from "./refresh-retained-metrics.use-case";
import { assertMetricAmendment } from "./metric-refresh-evidence-validation";
import type { RetainedMetricTarget } from "./refresh-retained-metrics.contracts";

jest.setTimeout(60_000);
describe("frozen metric operation membership", () => {
  let root: string, f: ReturnType<typeof incidentFixture>;
  const late = (): RetainedMetricTarget[] => Array.from({ length: 4 }, (_, i) => ({ ...f.original.targets[0]!,
    sourceItemId: `00000000-0000-7000-8000-${String(9000 + i).padStart(12, "0")}`, externalId: `hn:${9000 + i}`,
    canonicalUrl: `https://news.ycombinator.com/item?id=${9000 + i}` }));
  const current = (changes: number) => [...f.original.targets.map((t, i) => ({ ...t, identityDigest: i < changes ? afterDigest : t.identityDigest })), ...late()];
  const prepare = () => f.amendment().prepare(sha(f.original), "TEST exact reviewed content versions");
  const accept = async () => {
    const p = await prepare(); if (!p.ok) throw new Error(p.error);
    const c = await f.amendment().commit(sha(p.value), p.value.priorEffectiveSha, p.value.effectiveManifestSha);
    if (!c.ok) throw new Error(c.error);
    return { proposal: p.value, effective: c.value.effective };
  };
  const runner = (fetch = jest.fn<Promise<Result<never[], never>>, [readonly RetainedMetricTarget[]]>(async () => ok([]))) => ({ fetch,
    usecase: new RefreshRetainedMetricsUseCase(f.inventory, { fetch }, { project: jest.fn() }, f.receipts, f.clock, sha) });
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "metric-frozen-")); f = incidentFixture(root, 33);
    await f.receipts.install(metricEvidencePath("operation.json"), f.original);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it.each([16, 19, 32])("accepts exactly reviewed %i versions with four late rows, preserving v1 original bytes and budget", async (changes) => {
    f.change(current(changes));
    const bytes = readFileSync(join(root, metricEvidencePath("operation.json")));
    const { proposal, effective } = await accept();
    expect(proposal.version).toBe("retained-metrics-amendment.v1");
    expect(proposal.changes).toHaveLength(changes);
    expect(proposal.inventory).toHaveLength(33);
    expect(effective).toEqual({ ...f.original, targets: current(changes).slice(0, 33) });
    expect(readFileSync(join(root, metricEvidencePath("operation.json")))).toEqual(bytes);
    const r = runner(), result = await r.usecase.execute(effective);
    expect(result.ok && result.value.map((t) => t.sourceItemId).sort()).toEqual(f.original.targets.map((t) => t.sourceItemId).sort());
    expect(r.fetch.mock.calls.flatMap(([targets]) => targets.map((t) => t.sourceItemId)).sort()).toEqual(f.original.targets.map((t) => t.sourceItemId).sort());
    expect(await r.usecase.execute(effective)).toEqual(result);
    expect(r.fetch.mock.calls.flatMap(([targets]) => targets)).toHaveLength(33);
    await expect(f.amendment().commit(sha(proposal), proposal.priorEffectiveSha, proposal.effectiveManifestSha)).rejects.toThrow("metric_budget_already_started");
  });
  it("rejects 33 reviewed versions without installing a proposal or spending budget", async () => {
    f.change(current(33));
    expect(await prepare()).toEqual({ ok: false, error: "content_change_limit" });
    expect((await f.receipts.withOperation((o) => o.entries())).map((e) => e.name)).toEqual(["operation.json", "operation.lock"]);
  });
  it("rejects stored v1 evidence exceeding 32 changes as well as prepare admission", async () => {
    f.change(current(32));
    const p = await prepare(); if (!p.ok) throw new Error(p.error);
    expect(() => assertMetricAmendment(p.value)).not.toThrow();
    const extra = f.original.targets[32]!;
    expect(() => assertMetricAmendment({ ...p.value, changes: [...p.value.changes,
      { sourceItemId: extra.sourceItemId, before: extra.identityDigest, after: afterDigest }] })).toThrow();
  });
  it("admits late arrivals alone on resume, but initial planning still checks the full window", async () => {
    f.change(current(0));
    const r = runner(); expect((await r.usecase.execute(f.original)).ok).toBe(true);
    const otherRoot = mkdtempSync(join(tmpdir(), "metric-unplanned-"));
    try {
      const fresh = incidentFixture(otherRoot, 33); fresh.change(current(0));
      const usecase = new RefreshRetainedMetricsUseCase(fresh.inventory, { fetch: r.fetch }, { project: jest.fn() }, fresh.receipts, fresh.clock, sha);
      expect(await usecase.execute(fresh.original)).toEqual({ ok: false, error: "inventory_drift" });
      expect(await fresh.receipts.read(metricEvidencePath("operation.json"))).toBeNull();
    } finally { rmSync(otherRoot, { recursive: true, force: true }); }
  });
  it.each(["removed", "replaced", "tenantId", "workspaceId", "providerKey", "publishedAt", "canonicalUrl", "sourceBindingId", "configDigest", "feedDigest", "hidden", "disabled"])("refuses original %s drift during prepare, commit and apply despite four late arrivals", async (field) => {
    f.change(current(19));
    const p = await prepare(); if (!p.ok) throw new Error(p.error);
    const change = () => {
      const rows = current(19);
      if (field === "removed") rows.splice(0, 1);
      else if (field === "replaced") rows[0] = { ...rows[0]!, sourceItemId: "00000000-0000-7000-8000-000000009999" };
      else Object.assign(rows[0]!, { [field === "hidden" || field === "disabled" ? "rejection" : field]: field.endsWith("Digest") ? "e".repeat(64) : field });
      f.change(rows);
    };
    change();
    expect(await prepare()).toEqual({ ok: false, error: "inventory_drift" });
    expect(await f.amendment().commit(sha(p.value), p.value.priorEffectiveSha, p.value.effectiveManifestSha)).toEqual({ ok: false, error: "inventory_drift" });
    f.change(current(19));
    const c = await f.amendment().commit(sha(p.value), p.value.priorEffectiveSha, p.value.effectiveManifestSha);
    if (!c.ok) throw new Error(c.error);
    change();
    expect(await f.amendment().commit(sha(p.value), p.value.priorEffectiveSha, p.value.effectiveManifestSha)).toEqual({ ok: false, error: "inventory_drift" });
    const r = runner(); expect(await r.usecase.execute(c.value.effective)).toEqual({ ok: false, error: "inventory_drift" });
    expect(r.fetch).not.toHaveBeenCalled();
    expect(await f.receipts.read(metricEvidencePath("batch-0.reserved.json"))).toBeNull();
  });
  it.each(["before_reservation", "post_fetch"])("checks original targets %s and never uses a late replacement", async (phase) => {
    f.change(current(19)); const { effective } = await accept();
    const remove = () => f.change(f.current().filter((t) => t.sourceItemId !== effective.targets[0]!.sourceItemId));
    if (phase === "before_reservation") f.inventory.read.mockImplementationOnce(async () => { remove(); return null; });
    const r = runner(); r.fetch.mockImplementation(async () => { remove(); return ok([]); });
    expect(await r.usecase.execute(effective)).toEqual({ ok: false, error: "target_drift" });
    expect(r.fetch).toHaveBeenCalledTimes(phase === "post_fetch" ? 1 : 0);
    expect(await f.receipts.read(metricEvidencePath("batch-0.reserved.json")) === null).toBe(phase === "before_reservation");
    if (phase === "post_fetch") await expect(prepare()).rejects.toThrow("metric_budget_already_started");
  });
  it("rejects an unreviewed 20th digest after preparing 19, and reads the committed original membership", async () => {
    f.change(current(19)); const { proposal } = await accept();
    f.change(current(20));
    expect(await f.amendment().commit(sha(proposal), proposal.priorEffectiveSha, proposal.effectiveManifestSha)).toEqual({ ok: false, error: "inventory_drift" });
    const head = await f.receipts.withOperation((o) => resolveMetricOperation(o, sha, f.clock.now()));
    expect(head?.original).toEqual(f.original);
    expect(head?.effective.targets).toHaveLength(33);
    expect(await runner().usecase.execute(head!.effective)).toEqual({ ok: false, error: "inventory_drift" });
  });
});
