export const eligiblePromotionQuality = () => ({
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "eligible",
  flags: [],
  reason: "Promotion fixture",
});

export const redditPromotionFacts = (
  canonicalUrl: string,
  ingestionCutoff = new Date("2026-06-23T08:30:00.000Z"),
) => ({
  contentKind: "original_post" as const,
  canonicalIdentity: `url:${canonicalUrl}`,
  safetyValid: true,
  freshnessValid: true,
  freshnessProvenance: {
    status: "observed" as const,
    publishedAt: new Date("2026-06-23T08:00:00.000Z"),
    observedAt: new Date("2026-06-23T08:01:00.000Z"),
    ingestionCutoff,
  },
  metricsState: "observed" as const,
  metrics: { provider: "reddit" as const, score: 50, upvoteRatio: 0.6 },
});

export const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
