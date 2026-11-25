import { createHash } from "node:crypto";
import { retainedMetricRenewalGrant as grant, retainedMetricRenewalGrantProblem } from "../../domain/policies/retained-metric-renewal-grant";
import { implementation, renewalFixture } from "../../../../scripts/lib/retained-metric-renewal.spec-support";
import { assertMetricRenewalManifest } from "./metric-renewal-evidence";

jest.setTimeout(120_000);
describe("one fixed retained metric renewal admission", () => {
  it("uses the specified UUIDv5 name and URL namespace", () => {
    const bytes = createHash("sha1").update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
      .update(`social-monitor:${grant.evidencePath}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6]! & 15) | 80; bytes[8] = (bytes[8]! & 63) | 128;
    const hex = bytes.toString("hex");
    expect([hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")).toBe(grant.operationId);
  });
  it("captures every original across seven days including zero feed/missing metrics and a late arrival; freezes on repeated prepare", async () => {
    const f = renewalFixture();
    const late = { ...f.targets[0]!, sourceItemId: "00000000-0000-7000-8000-000000999999", externalId: "reddit:t3_late", canonicalUrl: "https://www.reddit.com/comments/late/" };
    f.setCurrent([...f.targets.map((t, i) => i === 0 ? { ...t, identityDigest: "d".repeat(64) } : t), late]);
    const prepared = await f.usecase().prepare(implementation);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.error.detail);
    expect(prepared.value.targets).toHaveLength(3330);
    expect(prepared.value.capture.originalAudit).toHaveLength(3329);
    expect(prepared.value.capture.originalAudit[0]?.differences).toContainEqual({ field: "identityDigest", before: "b".repeat(64), after: "d".repeat(64) });
    expect(prepared.value.capture.lateArrivalSourceItemIds).toEqual([late.sourceItemId]);
    expect(f.inventory.list.mock.calls.map((c) => c[1]?.length)).toEqual([3329, undefined, 3329, undefined]);
    f.inventory.list.mockClear(); f.renewal.install.mockClear(); f.setCurrent([]);
    expect(await f.usecase().prepare(implementation)).toEqual(prepared);
    expect(f.inventory.list).not.toHaveBeenCalled(); expect(f.renewal.install).not.toHaveBeenCalled(); expect(f.fetcher.fetch).not.toHaveBeenCalled();
    for (const mutation of [{ operationId: f.original.operationId }, { evidencePath: `${grant.evidencePath}-2` }, { sourceBase: "a".repeat(40) },
      { version: "retained-metrics.v1" }, { scope: { ...prepared.value.scope, dates: [grant.dates[0]] } }]) {
      expect(retainedMetricRenewalGrantProblem({ ...prepared.value, ...mutation })).not.toBeNull();
    }
    expect(() => assertMetricRenewalManifest({ ...prepared.value, extra: true }, f.hash, f.clock.now())).toThrow();
  });
  it.each(["missing", "moved", "duplicate", "drift"])("refuses %s originals or capture drift without admission", async (kind) => {
    const f = renewalFixture();
    if (kind === "missing") f.setCurrent(f.targets.slice(1));
    if (kind === "moved") f.setCurrent(f.targets.map((t, i) => i ? t : { ...t, publishedAt: "2026-08-29T11:00:00.000Z" }));
    if (kind === "duplicate") f.setCurrent([...f.targets, f.targets[0]!]);
    if (kind === "drift") f.inventory.list.mockImplementationOnce(async () => {
      f.setCurrent(f.targets.map((t, i) => i ? t : { ...t, identityDigest: "e".repeat(64) })); return f.targets;
    });
    expect(await f.usecase().prepare(implementation)).toMatchObject({ ok: false });
    expect(f.renewal.install).not.toHaveBeenCalled(); expect(f.fetcher.fetch).not.toHaveBeenCalled();
  });
  it("requires a completely bound predecessor final, never just a terminal count", async () => {
    const f = renewalFixture(); f.prior.values.delete(`${grant.predecessorPath}/batch-0.observed.json`);
    expect(await f.usecase().prepare(implementation)).toMatchObject({ ok: false });
    expect(f.inventory.list).not.toHaveBeenCalled();
  });
});
