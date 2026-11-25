import { readerPostPromotionMetricEligible } from "./reader-post-promotion-engagement";
import { rankReaderPromotionCandidates, type ReaderPromotionCandidateInput } from "./reader-promotion-ranking";
import { READER_PROMOTION_POLICY_STAMP, READER_PROMOTION_V1_CONTEXT } from "./reader-promotion-policy-version";

const publishedAt = "2026-11-01T12:00:00.000000Z";
const context = { policyVersion: READER_PROMOTION_POLICY_STAMP,
  ingestionCutoff: "2026-11-02T08:15:00.000000Z" };
const candidate = (n: number, value: number): ReaderPromotionCandidateInput => ({
  candidateId: `candidate-${n}`, sourceItemId: `source-${n}`, storyId: `story-${n}`,
  providerKey: "x", providerFamily: "x", publishedAt, title: "Public release",
  usefulness: "useful", relevance: "central",
  engagement: { value, observedAt: "2026-11-01T12:30:00.000000Z" },
});

describe("Versioned reader popularity eligibility", () => {
  it("keeps historical V1 six-hour zero while V2 uses genuine young observations", () => {
    const posts = [0, 1, 2, 3, 1000].map((v, i) => candidate(i, v));
    const old = rankReaderPromotionCandidates(posts, undefined, READER_PROMOTION_V1_CONTEXT);
    const current = rankReaderPromotionCandidates(posts, undefined, context);
    expect(old.policyVersion).toBe("reader_promotion.2026-11-01");
    expect(old.top.every((p) => !p.ranking.metricMature && p.ranking.popularity === null)).toBe(true);
    expect(current.policyVersion).toBe(READER_PROMOTION_POLICY_STAMP);
    expect(current.top[0]!.engagement!.value).toBe(1000);
    expect(current.top[0]!.ranking.popularity).toEqual({ cohortSize: 5, below: 4, equal: 1 });
    expect(current.top[0]!.ranking.signalScore).toBe(9);
  });

  it.each([
    [publishedAt, true], [context.ingestionCutoff, true],
    ["2026-11-01T11:59:59.999999Z", false],
    ["2026-11-02T08:15:00.000001Z", false], ["unknown", false],
  ])("checks observation boundary %s exactly", (observedAt, expected) => {
    expect(readerPostPromotionMetricEligible({ observedAt }, publishedAt, context)).toBe(expected);
  });

  it("retains semantic admission, unique-source minimum and family separation", () => {
    const posts = [1, 2, 3, 4].map((v, i) => candidate(i, v));
    const result = rankReaderPromotionCandidates([...posts,
      { ...candidate(9, 99999), usefulness: "noise" },
      { ...candidate(8, 100), sourceItemId: "source-0" },
      { ...candidate(7, 200), providerKey: "reddit", providerFamily: "reddit" },
    ], undefined, context);
    expect(result.excluded).toContainEqual({ candidateId: "candidate-9", reason: "semantic_not_admitted" });
    expect(result.top.every((p) => p.ranking.popularity === null)).toBe(true);
  });
});
