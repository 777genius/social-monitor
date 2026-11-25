import { createHash } from "node:crypto";
import { retainedMetricRenewalGrant as grant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";
import * as receipts from "./retained-metric-refresh-receipts";
import { renewalFixture } from "./retained-metric-renewal.spec-support";
import { renewalDurabilityHash } from "./retained-metric-renewal-durability.spec-support";

afterEach(() => jest.restoreAllMocks());
it("keeps the complete base predecessor bytes with two original hashes per construction", () => {
  const digest = jest.spyOn(receipts, "metricRefreshDigest");
  for (let construction = 0; construction < 2; construction++) {
    digest.mockClear();
    const fixture = renewalFixture();
    expect(digest.mock.calls).toEqual([[fixture.original], [fixture.original]]);
    expect(fixture.targets).toHaveLength(3329);
    const entries = [...fixture.prior.values];
    expect(entries).toHaveLength(3399);
    expect(entries.filter(([name]) => name.endsWith(".reserved.json"))).toHaveLength(34);
    const bytes = JSON.stringify(entries.map(([name, value]) => [name, receipts.canonicalMetricRefreshJson({ digest: receipts.metricRefreshDigest(value), value })]));
    // Complete canonical envelopes captured from base 1c1bfea, including every reservation and final binding.
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("58789437d080e276c233aa821d70743d5bc462485e5550929bf74434c678550b");
  }
});
it("hashes each original, mutated original and renewal invocation without caching", () => {
  const fixture = renewalFixture(), realDigest = receipts.metricRefreshDigest;
  const childHash = renewalDurabilityHash(realDigest(fixture.original));
  const digest = jest.spyOn(receipts, "metricRefreshDigest");
  const renewal = { ...structuredClone(fixture.original), operationId: grant.operationId, evidencePath: grant.evidencePath };
  for (const hash of [fixture.hash, childHash]) {
    for (const value of [fixture.original, renewal, fixture.original]) {
      const plannedAt = value.plannedAt;
      for (const timestamp of [plannedAt, "2026-09-07T12:00:00.000Z", plannedAt]) {
        value.plannedAt = timestamp;
        const sha = realDigest(value);
        digest.mockClear();
        expect(hash(value)).toBe(value === fixture.original && timestamp === plannedAt ? grant.predecessorManifestSha : sha);
        expect(digest.mock.calls).toEqual([[value]]);
      }
    }
  }
});
