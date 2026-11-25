import {
  classifyFeedPromotionEligibility, evaluateReaderPromotionV2, rankReaderPromotionV2,
} from "@social-monitor/feed/domain";
import { tenantId, workspaceId, type JsonObject, type JsonValue } from "@social-monitor/shared-kernel";
import { promotionSafeProviderMetadata } from "./rank-feed-item-projection";
import {
  context, feedItem, matchingTitle, metadataWith, nativeMetadata, now,
  projectedContext, rankItems, scope, v2Candidate,
} from "./rank-promotion-topic-context.spec-support";

describe("promotion snapshot verified topic context through reader V2", () => {
  it("restores relevant nonlegacy literal query matching without changing native metrics", async () => {
    const [bound] = await rankItems([feedItem()]);
    const [unbound] = await rankItems([feedItem({ providerMetadata: nativeMetadata })], { query: "bread recipes" });
    expect(bound!.providerMetadata).toEqual({ ...nativeMetadata, ...projectedContext });
    expect(bound!.contentQuality).toMatchObject({ interestRelevanceScore: 0.9,
      qualityScore: 0.8, engagementIntegrityScore: 0.92, decision: "promote", eligibleForTopRead: true });
    expect(unbound!.contentQuality).toMatchObject({ interestRelevanceScore: 0.38, decision: "downrank" });
    expect(evaluateReaderPromotionV2(v2Candidate(bound!))).toMatchObject({ admitted: true, topQualified: true, providerSignal: 338 });
    expect(evaluateReaderPromotionV2(v2Candidate(unbound!))).toMatchObject({ admitted: false,
      reasons: expect.arrayContaining(["relevance_floor_not_met", "quality_floor_not_met"]) });
    expect(classifyFeedPromotionEligibility({ providerKey: scope.providerKey, providerMetadata: bound!.providerMetadata }))
      .toEqual(classifyFeedPromotionEligibility(feedItem().toSnapshot()));
  });

  it("lets higher native metrics compete only after independent relevance and quality pass", async () => {
    const items = await rankItems([
      feedItem({ id: "low", canonicalUrl: "https://example.test/low", providerMetadata: metadataWith({ points: 63 }) }),
      feedItem({ id: "high", canonicalUrl: "https://example.test/high" }),
      feedItem({ id: "irrelevant", canonicalUrl: "https://example.test/irrelevant",
        title: "Local football stadium serves sandwiches after weekend matches",
        providerMetadata: metadataWith({ points: 999999 }) }),
    ]);
    const ranking = rankReaderPromotionV2(items.map(v2Candidate));
    expect(ranking.orderedCandidateIds).toEqual(["high", "low"]);
    expect(ranking.ranked.every((item) => item.topQualified)).toBe(true);
    expect(ranking.ranked[0]!.components.total).toBeGreaterThan(ranking.ranked[1]!.components.total);
    expect(ranking.rejected).toMatchObject([{ candidateId: "irrelevant", reasons: expect.arrayContaining(["relevance_floor_not_met"]) }]);
    expect(items.find((item) => item.feedItemId === "irrelevant")!.contentQuality).toMatchObject({
      interestRelevanceScore: 0.38, decision: "downrank", flags: expect.arrayContaining(["weak_topic_match"]),
    });
  });

  it.each([
    ["tenant", { tenantId: tenantId("other-tenant") }],
    ["workspace", { workspaceId: workspaceId("other-workspace") }],
    ["interest", { interestId: "other-interest" }],
    ["binding", { sourceBindingId: "other-binding" }],
  ] as const)("rejects stored context transplanted onto a different hydrated %s", async (_name, change) => {
    if (_name === "binding") {
      const [item] = await rankItems([feedItem(change)], { query: "bread recipes" });
      expect(item!.providerMetadata).toEqual({ ...nativeMetadata, query: "bread recipes" });
      expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(false);
    } else {
      await expect(rankItems([feedItem(change)])).rejects.toMatchObject({ code: "operation.conflict" });
    }
  });

  const malformed: readonly (JsonValue | undefined)[] = [undefined, null, [], "forged", 123, {}, { query: matchingTitle }];
  for (const field of ["interestQuerySnapshot", "sourceBindingSnapshot", "workspaceScopeSnapshot"] as const) {
    it.each(malformed)(`ignores malformed stored ${field} with independently unrelated intent: %j`, async (value) => {
      const metadata: Record<string, JsonValue> = { ...nativeMetadata, ...context };
      if (value === undefined) delete metadata[field];
      else metadata[field] = value;
      const [item] = await rankItems([feedItem({ providerMetadata: metadata })], { query: "bread recipes" });
      expect(item!.providerMetadata).toEqual({ ...nativeMetadata, query: "bread recipes" });
      expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(false);
    });
  }

  it.each<JsonObject>([
    { sourceBindingSnapshot: { ...context.sourceBindingSnapshot, providerKey: "reddit" } },
    { sourceBindingSnapshot: { ...context.sourceBindingSnapshot, sourceBindingId: "" } },
    { interestQuerySnapshot: { ...context.interestQuerySnapshot, query: "   " } },
    { interestQuerySnapshot: { ...context.interestQuerySnapshot, query: 5 } },
    ...([null, [], "search", {}, { query: "Mistral financing" },
      { mode: "search", query: " " }, { mode: "search", query: 5 },
      { mode: "", query: "Mistral financing" }, { mode: 5, query: "Mistral financing" },
      { mode: "invented", query: "Mistral financing" }] as JsonValue[]).map((sourceQuery) => ({
      sourceBindingSnapshot: { ...context.sourceBindingSnapshot, sourceQuery },
    })),
  ])("rejects malformed or mismatched nested query contracts %j", async (patch) => {
    const [item] = await rankItems([feedItem({ providerMetadata: metadataWith(patch) })], { query: "bread recipes" });
    expect(item!.providerMetadata).toEqual({ ...nativeMetadata, query: "bread recipes" });
    expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(false);
  });

  it.each(["search", "listing", "account_feed", "thread", "url"])("uses configured intent independently of %s acquisition mode", async (mode) => {
    const [item] = await rankItems([feedItem({ providerMetadata: metadataWith({
      sourceBindingSnapshot: { ...context.sourceBindingSnapshot, sourceQuery: { mode, query: "Mistral financing" } },
    }) })]);
    expect(item!.providerMetadata).toEqual({ ...nativeMetadata,
      query: "Mistral financing",
    });
    expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(true);
  });

  it("does not infer independent scope or provider identity from the metadata", () => {
    const metadata = metadataWith({});
    expect(promotionSafeProviderMetadata(scope.providerKey, metadata)).toEqual(nativeMetadata);
    expect(promotionSafeProviderMetadata(scope.providerKey, metadata, { ...scope, providerKey: "reddit" })).toEqual(nativeMetadata);
    for (const key of ["tenantId", "workspaceId", "interestId", "sourceBindingId", "providerKey"] as const) {
      expect(promotionSafeProviderMetadata(scope.providerKey, metadata, { ...scope, [key]: "" })).toEqual(nativeMetadata);
    }
  });

  it("maps only approved query fields and keeps forged authority and arbitrary metadata out", async () => {
    const [item] = await rankItems([feedItem({ providerMetadata: metadataWith({
      searchQuery: "football", query: "football", topic: "football", topics: ["football"],
      community: "football", comments: 999999, views: 999999, arbitrary: { value: "untrusted" },
      official: true, trusted: true,
      interestQuerySnapshot: { ...context.interestQuerySnapshot, extra: "untrusted" },
      sourceBindingSnapshot: { ...context.sourceBindingSnapshot, extra: "untrusted",
        sourceQuery: { ...context.sourceBindingSnapshot.sourceQuery, extra: "untrusted" } },
      workspaceScopeSnapshot: { ...context.workspaceScopeSnapshot, extra: "untrusted" },
    }) })]);
    expect(item!.providerMetadata).toEqual({ ...nativeMetadata, ...projectedContext });
    expect(evaluateReaderPromotionV2(v2Candidate(item!))).toMatchObject({ admitted: true, providerSignal: 338 });
  });

  it.each<JsonObject>([
    { promotionAuthority: { official: true, trusted: true, attestedBy: "provider" } },
    { contentKind: "comment" },
    { kind: "hacker_news_comment" },
    { points: "338" },
  ])("retains canonical rejection for contaminated provenance or metrics %j", (patch) => {
    const metadata = metadataWith(patch);
    expect(classifyFeedPromotionEligibility({ providerKey: scope.providerKey, providerMetadata: metadata }).eligible).toBe(false);
    // The canonical gate still rejects before context can be projected.
    const projected = promotionSafeProviderMetadata(scope.providerKey, metadata, scope);
    expect(classifyFeedPromotionEligibility({ providerKey: scope.providerKey, providerMetadata: projected }).eligible).toBe(false);
    expect(projected).toMatchObject({ ...nativeMetadata, ...patch });
    expect(projected).not.toHaveProperty("interestQuerySnapshot");
  });

  it.each(["producer", "source_catalog"])("preserves existing %s authority attestation", async (attestedBy) => {
    const promotionAuthority = { official: true, trusted: true, attestedBy };
    const [item] = await rankItems([feedItem({ providerMetadata: metadataWith({ promotionAuthority }) })]);
    expect(item!.providerMetadata).toEqual({ ...nativeMetadata, ...projectedContext, promotionAuthority });
    expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(true);
  });

  it.each(["missing", "unresolved_regression"] as const)("does not let context override %s metric authority", async (authority) => {
    const [item] = await rankItems([feedItem()], { authority });
    expect(item!.contentQuality!.decision).toBe("promote");
    expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(false);
  });

  it("retains X crypto promotion rejection even with matching context and high native signal", async () => {
    const query = "Crypto rewards";
    const [item] = await rankItems([feedItem({ providerKey: "x-twitter",
      title: "Crypto rewards giveaway offers trading prizes for everyone joining today",
      providerMetadata: { kind: "x_post", contentKind: "original_post", likes: 1024, reposts: 78,
        ...context, interestQuerySnapshot: { interestId: scope.interestId, query },
        sourceBindingSnapshot: { ...context.sourceBindingSnapshot, providerKey: "x-twitter", sourceQuery: { mode: "search", query } } },
    })]);
    expect(item!.contentQuality).toMatchObject({ decision: "reject", flags: expect.arrayContaining(["crypto_promo"]) });
    expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(false);
    expect(classifyFeedPromotionEligibility({ providerKey: "x-twitter", providerMetadata: item!.providerMetadata }))
      .toMatchObject({ eligible: true, metrics: { likes: 1024, reposts: 78 } });
  });

  it.each<[string, JsonObject]>([
    ["x-twitter", { kind: "x_post", contentKind: "original_post", likes: 124, reposts: 9 }],
    ["reddit", { kind: "reddit_post", score: 87, upvoteRatio: 0.9 }],
    ["hacker-news", nativeMetadata],
    ["github-repo-radar", { kind: "github_repository_trend", repository: { forksCount: 9 },
      trend: { primaryWindow: "24h", checkedAt: now.toISOString(), totalStars: 500, stars24h: 42, forks24h: 8 } }],
  ])("preserves %s canonical metrics through context projection and V2", async (providerKey, native) => {
    const original = feedItem({ providerKey, providerMetadata: { ...native, ...context,
      sourceBindingSnapshot: { ...context.sourceBindingSnapshot, providerKey } } });
    const [item] = await rankItems([original]);
    expect(classifyFeedPromotionEligibility({ providerKey, providerMetadata: item!.providerMetadata }))
      .toEqual(classifyFeedPromotionEligibility(original.toSnapshot()));
    expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(true);
  });
});
