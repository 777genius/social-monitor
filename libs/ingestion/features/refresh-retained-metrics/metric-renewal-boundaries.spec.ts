import { implementation, renewalFixture } from "../../../../scripts/lib/retained-metric-renewal.spec-support";
import { assertMetricRenewalManifest } from "./metric-renewal-evidence";
import { retainedMetricRenewalGrant as grant } from "../../domain/policies/retained-metric-renewal-grant";
import { metricIdentityInventory, orderedMetricTargets } from "./metric-refresh-amendment";

jest.setTimeout(120_000);
it("allows authority evolution between captures while preserving the first full-window baseline", async () => {
  const f = renewalFixture();
  const changed = f.targets.map((t) => ({ ...t, authority: { ...t.authority, metricsHash: "a".repeat(64),
    observedAt: "2026-09-08T11:00:00.000Z", observationAt: "2026-09-08T11:00:00.000Z", observationCount: 1 } }));
  f.inventory.list.mockResolvedValueOnce(f.targets).mockResolvedValueOnce(f.targets).mockResolvedValueOnce(changed).mockResolvedValueOnce(changed);
  const prepared = await f.usecase().prepare(implementation);
  expect(prepared.ok).toBe(true); if (!prepared.ok) throw new Error(prepared.error.detail);
  expect(prepared.value.targets[0]!.authority).toEqual(f.targets[0]!.authority);
  expect(prepared.value.capture.originalAudit[0]!.currentTarget!.authority).toEqual(changed[0]!.authority);
  expect(prepared.value.capture.originalAudit[0]!.differences.map((d) => d.field)).toEqual(["authority"]);
});
it("rejects normalized aliases, 10001 sources, 1001 feed rows and predecessor pin changes before any effect", async () => {
  const f = renewalFixture();
  const edges = grant.dates.flatMap((date, i) => ["hacker-news", "reddit"].map((providerKey, j) => ({
    ...f.targets[0]!, sourceItemId: `00000000-0000-7000-8000-${String(999900 + i * 2 + j).padStart(12, "0")}`,
    providerKey: providerKey as "hacker-news" | "reddit", publishedAt: `${date}T00:00:00.000Z`, visibleFeedCount: 0,
    externalId: j ? `reddit:t3_edge${i}` : `hn:${900000 + i}`,
    canonicalUrl: j ? `https://www.reddit.com/comments/edge${i}/` : `https://news.ycombinator.com/item?id=${900000 + i}`,
  })));
  f.setCurrent([...f.targets, ...edges]);
  const prepared = await f.usecase().prepare(implementation);
  expect(prepared.ok).toBe(true); if (!prepared.ok) throw new Error(prepared.error.detail);
  const valid = prepared.value;
  expect(valid.capture.lateArrivalSourceItemIds).toEqual(edges.map((t) => t.sourceItemId).sort());
  expect(valid.targets).toHaveLength(grant.originalCount + 14);
  const alias = { ...valid.targets[0]!, sourceItemId: "00000000-0000-7000-8000-000000999999",
    externalId: valid.targets[0]!.externalId.replace("reddit:t3_", "reddit:") };
  for (const targets of [[...valid.targets, alias], [...valid.targets, ...Array.from({ length: 10001 - valid.targets.length }, () => alias)],
    valid.targets.map((t, i) => i ? t : { ...t, visibleFeedCount: 1001 })]) {
    expect(() => assertMetricRenewalManifest({ ...valid, targets, capture: { ...valid.capture,
      inventorySha: f.hash(orderedMetricTargets(targets)), identityInventorySha: f.hash(metricIdentityInventory(targets)) } }, f.hash, f.clock.now())).toThrow();
  }
  for (const field of ["originalOperationBytesSha", "effectiveManifestSha", "finalBytesSha", "entriesSha"] as const) {
    f.renewal.values.set(`${grant.evidencePath}/operation.json`, { ...valid, predecessor: { ...valid.predecessor, [field]: "f".repeat(64) } });
    f.inventory.list.mockClear();
    expect(await f.usecase().execute(f.hash(f.renewal.values.get(`${grant.evidencePath}/operation.json`)))).toMatchObject({ ok: false });
    expect(f.inventory.list).not.toHaveBeenCalled();
  }
  expect(f.fetcher.fetch).not.toHaveBeenCalled(); expect(f.projection.project).not.toHaveBeenCalled();
});
