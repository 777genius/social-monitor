import { classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import { readerPostPromotionEngagementFact } from "./reader-post-promotion-engagement-facts";

describe("assessed quote author metrics", () => {
  const providerMetadata = { kind: "x_post", contentKind: "quote", likes: 100, retweets: 2 };
  const query = { providerKey: "x-twitter", providerMetadata,
    engagementObservedAt: "2026-10-31T18:00:00.000000Z" };
  it("keeps legacy quote promotion closed while V3 reads strict native counts", () => {
    expect(classifyFeedPromotionEligibility(query).eligible).toBe(false);
    expect(readerPostPromotionEngagementFact(query)).toEqual({
      method: "likes_plus_two_reposts", value: 104,
      observedAt: query.engagementObservedAt,
    });
  });
  it("rejects conflicting aliases, absent timestamps and reply identities", () => {
    expect(readerPostPromotionEngagementFact({ ...query, providerMetadata: {
      ...providerMetadata, metrics: { likes: 101 },
    } })).toBeNull();
    expect(readerPostPromotionEngagementFact({ ...query, engagementObservedAt: null })).toBeNull();
    expect(readerPostPromotionEngagementFact({ ...query, providerMetadata: {
      ...providerMetadata, contentKind: "reply",
    } })).toBeNull();
    expect(readerPostPromotionEngagementFact({ ...query, providerMetadata: {
      ...providerMetadata, postType: "reply",
    } })).toBeNull();
  });
});
