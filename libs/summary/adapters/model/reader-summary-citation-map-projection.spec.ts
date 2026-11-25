import { dailyDigestFixture } from "./reader-summary-daily-digest.fixture";
import {
  buildReaderSummaryEvidenceCitationMap as oldCitationMap,
  readerSummaryCitableEvidence as oldCitableEvidence,
} from "./reader-summary-evidence-citation-map";
import { readerSummaryCitableEvidence } from "./reader-summary-citable-evidence";
import { buildReaderSummaryEvidenceCitationMap } from "./reader-summary-citation-map-projection";

describe("reader summary citation responsibility separation", () => {
  it("retains the historical callable exports as identical function objects", () => {
    expect(oldCitableEvidence).toBe(readerSummaryCitableEvidence);
    expect(oldCitationMap).toBe(buildReaderSummaryEvidenceCitationMap);
  });

  it("keeps citation sequence, original source binding and immutable input", async () => {
    const { input } = await dailyDigestFixture();
    const evidence = readerSummaryCitableEvidence(input.evidence);
    const snapshot = JSON.stringify(evidence);
    expect(buildReaderSummaryEvidenceCitationMap(evidence)).toEqual(evidence.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: item.canonicalUrl.length === 0 ? "title" : "canonicalUrl",
      canonicalUrl: item.canonicalUrl,
    })));
    expect(JSON.stringify(evidence)).toBe(snapshot);
    expect(buildReaderSummaryEvidenceCitationMap([])).toEqual([]);
  });

  it("projects missing canonical URL as title without erasing provider identity", async () => {
    const { input } = await dailyDigestFixture();
    const first = input.evidence.selectedEvidence[0]!;
    const withoutUrl = { ...first, canonicalUrl: "" };
    const citations = buildReaderSummaryEvidenceCitationMap([withoutUrl, first]);
    expect(citations.map(item => item.citationId)).toEqual(["c1", "c2"]);
    expect(citations.map(item => item.field)).toEqual([
      "title", first.canonicalUrl.length === 0 ? "title" : "canonicalUrl",
    ]);
    expect(citations.map(item => item.providerKey)).toEqual([first.providerKey, first.providerKey]);
    expect(withoutUrl.canonicalUrl).toBe("");
    expect(first.canonicalUrl).toBe(input.evidence.selectedEvidence[0]!.canonicalUrl);
  });
});
