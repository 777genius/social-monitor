import { retainedMetricDailyAuthorities, retainedMetricDailyGrant } from "../../domain/policies/retained-metric-daily-grant";
import { dailyFixture, dailyDate, dailyGrant } from "../../../../scripts/lib/retained-metric-daily.spec-support";
import { implementation } from "../../../../scripts/lib/retained-metric-renewal.spec-support";
import { assertMetricDailyManifest } from "./metric-daily-manifest";
import { assertMetricRenewalManifest } from "./metric-renewal-evidence";
import { assertMetricManifest } from "./metric-refresh-evidence-validation";
import { target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";

jest.setTimeout(120_000);
it("admits only seven reviewed dates with distinct paths and operations and unchanged bounds", () => {
  expect(retainedMetricDailyAuthorities).toHaveLength(7);
  expect(new Set(retainedMetricDailyAuthorities.map((a) => a.operationId)).size).toBe(7);
  expect(new Set(retainedMetricDailyAuthorities.map((a) => a.evidencePath)).size).toBe(7);
  for (const a of retainedMetricDailyAuthorities) {
    const grant = retainedMetricDailyGrant(a.date)!;
    expect(grant.dates).toEqual([a.date]);
    expect(Date.parse(grant.endAt) - Date.parse(`${a.date}T00:00:00Z`)).toBe(86_400_000);
    expect(grant.bounds).toEqual({ targets: 10000, redditBatch: 100, hnBatch: 1, attempts: 1, concurrency: 1, timeoutMs: 10000 });
  }
  for (const date of ["2026-09-06", "2026-09-02T00:00:00Z", "../2026-09-02", ""]) expect(retainedMetricDailyGrant(date)).toBeNull();
});
it("validates the full predecessor chain, audits only exact selected-day IDs, freezes arrivals and rejects schema/scope/bounds tampering", async () => {
  const f = await dailyFixture();
  const arrival = target({ sourceItemId: "00000000-0000-7000-8000-000000099999", externalId: "reddit:t3_arrival",
    canonicalUrl: "https://www.reddit.com/comments/arrival/", publishedAt: `${dailyDate}T12:00:00.000Z` });
  f.setCurrent([...f.targets, arrival]);
  const result = await f.usecase().prepare(implementation);
  expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error.detail);
  const manifest = result.value;
  expect(manifest.predecessor.originalSourceItemIds).toHaveLength(3329);
  const ids = f.targets.filter((t) => t.publishedAt.startsWith(dailyDate)).map((t) => t.sourceItemId);
  expect(f.inventory.list.mock.calls.map((c) => c[1])).toEqual([ids, undefined, ids, undefined]);
  expect(manifest.capture.originalAudit.map((a) => a.sourceItemId)).toEqual(ids);
  expect(manifest.capture.lateArrivalSourceItemIds).toEqual([arrival.sourceItemId]);
  expect(manifest.targets.every((t) => t.publishedAt.startsWith(dailyDate))).toBe(true);
  expect(() => assertMetricRenewalManifest(manifest, f.hash, f.clock.now())).toThrow();
  expect(() => assertMetricManifest(manifest, f.clock.now())).toThrow();
  const variants = [
    { ...manifest, operationId: "arbitrary" }, { ...manifest, evidencePath: "elsewhere" },
    { ...manifest, version: "retained-metrics-renewal.v1" }, { ...manifest, sourceBase: "f".repeat(40) },
    { ...manifest, bounds: { ...manifest.bounds, attempts: 2 } },
    { ...manifest, scope: { ...manifest.scope, dates: ["2026-09-01", dailyDate] } },
    { ...manifest, scope: { ...manifest.scope, tenantId: arrival.sourceItemId } },
    ...["2026-09-01T23:59:59.999Z", dailyGrant.endAt].map((publishedAt) => ({ ...manifest, targets: [{ ...manifest.targets[0], publishedAt }] })),
    { ...manifest, targets: [{ ...manifest.targets[0], providerKey: "x" }] },
    { ...manifest, targets: [manifest.targets[0], manifest.targets[0]] },
    { ...manifest, targets: [...manifest.targets, { ...manifest.targets[0], sourceItemId: "00000000-0000-7000-8000-000000099998",
      externalId: manifest.targets[0]!.externalId.replace("reddit:t3_", "reddit:") }] },
    { ...manifest, targets: Array.from({ length: 10001 }, () => manifest.targets[0]) },
    { ...manifest, capture: { ...manifest.capture, implementation: { ...implementation, sourceSha: "invalid" } } },
    { ...manifest, spentRenewal: { ...manifest.spentRenewal, finalBytesSha: "f".repeat(64) } },
  ];
  for (const value of variants) expect(() => assertMetricDailyManifest(value, f.hash, f.clock.now())).toThrow();
  f.inventory.list.mockClear(); f.setCurrent([...f.targets, arrival, { ...arrival, sourceItemId: "post-freeze" }]);
  expect(await f.usecase().prepare(implementation)).toEqual(result);
  expect(f.inventory.list).not.toHaveBeenCalled(); expect(f.fetcher.fetch).not.toHaveBeenCalled();
});
it.each(["missing", "double-read", "predecessor"])("refuses %s drift without spending or installing a day", async (kind) => {
  const f = await dailyFixture();
  if (kind === "missing") f.setCurrent(f.targets.filter((t) => t.sourceItemId !== f.targets[3]!.sourceItemId));
  if (kind === "double-read") {
    const list = f.inventory.list.getMockImplementation()!;
    f.inventory.list.mockImplementation(async (scope, ids) => {
      const rows = await list(scope, ids);
      return f.inventory.list.mock.calls.length === 4 ? rows.slice(1) : rows;
    });
  }
  if (kind === "predecessor") f.renewal.values.delete(`${f.renewal.root}/final.json`);
  const result = await f.usecase().prepare(implementation);
  expect(result.ok).toBe(false);
  if (!result.ok && kind === "missing") expect(result.error.originalAudit?.some((a) => a.missingReason === "original_missing")).toBe(true);
  expect(f.daily.values.size).toBe(0); expect(f.fetcher.fetch).not.toHaveBeenCalled();
});
