import { SourceContentQualityPolicy } from "./source-content-quality";

describe("SourceContentQualityPolicy", () => {
  const policy = new SourceContentQualityPolicy();

  it("rejects crypto promo engagement-bait X posts even when they contain AI words", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "Def_Rambo",
      title:
        "I have been watching the AI space on BingX. Drop your top 3 projects.",
      bodyPreview:
        "I have been watching the AI space on BingX. Drop your top 3 projects. #AI #Crypto #Tech",
      canonicalUrl: "https://x.com/Def_Rambo/status/2070724979251941651",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "OpenAI",
        likes: 83,
        reposts: 58,
        replies: 26,
      },
    });

    expect(verdict.decision).toBe("reject");
    expect(verdict.eligibleForSummary).toBe(false);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(false);
    expect(verdict.flags).toEqual(
      expect.arrayContaining([
        "crypto_promo",
        "engagement_bait",
        "weak_topic_match",
      ]),
    );
  });

  it("keeps official t.co-only X posts out of summaries until link context is hydrated", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "NVIDIAAI",
      title: "https://t.co/yQHkkbmVeR",
      bodyPreview: "https://t.co/yQHkkbmVeR",
      canonicalUrl: "https://x.com/NVIDIAAI/status/2070654232139833720",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "OpenAI",
        likes: 296,
        reposts: 35,
        replies: 14,
      },
    });

    expect(verdict.decision).toBe("needs_context");
    expect(verdict.eligibleForSummary).toBe(false);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(
      expect.arrayContaining([
        "official_account",
        "tco_only",
        "url_only",
        "needs_link_context",
      ]),
    );
  });

  it("promotes self-contained topical X posts", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "OpenAI",
      title:
        "OpenAI released new agent eval tooling for production reliability.",
      bodyPreview:
        "The update adds trace-based scoring, failure clustering and regression checks for AI agent deployments.",
      canonicalUrl: "https://x.com/OpenAI/status/2070000000000000000",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "OpenAI agents",
        likes: 420,
        reposts: 90,
        replies: 31,
      },
    });

    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.qualityScore).toBeGreaterThanOrEqual(0.8);
    expect(verdict.topicRelevanceScore).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps prediction-market political rumors out of X top reads", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "Polymarket",
      title:
        "Polymarket says Trump administration may allow Anthropic restore next week",
      bodyPreview:
        "Market odds moved after a rumor that the White House could allow Anthropic to restore access next week.",
      canonicalUrl: "https://x.com/Polymarket/status/2070920594380746857",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "anthropic",
        likes: 5802,
        reposts: 316,
        replies: 211,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(
      expect.arrayContaining(["prediction_market_rumor"]),
    );
  });

  it("does not let an LLM review override deterministic hard blockers", () => {
    const deterministic = policy.evaluate({
      providerKey: "x-twitter",
      title: "https://t.co/abc123",
      bodyPreview: "https://t.co/abc123",
      canonicalUrl: "https://x.com/example/status/1",
      providerMetadata: { kind: "x_post", searchQuery: "OpenAI" },
    });
    const merged = policy.mergeWithReview(deterministic, {
      decision: "promote",
      confidence: 0.98,
      qualityScore: 1,
      topicRelevanceScore: 1,
      engagementIntegrityScore: 1,
      flags: ["llm_promoted"],
      reason: "Model thought it looked important.",
    });

    expect(merged.eligibleForSummary).toBe(false);
    expect(merged.eligibleForTopRead).toBe(false);
    expect(merged.decision).toBe(deterministic.decision);
  });

  it("keeps off-topic non-X search results out of top reads while allowing LLM review", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title: "The US Army issued ocarinas to soldiers in World War II",
      bodyPreview: "A history discussion about wartime musical instruments.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48670103",
      providerMetadata: {
        kind: "hacker_news_story",
        searchQuery: "flutter dart",
        points: 167,
        comments: 77,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(expect.arrayContaining(["weak_topic_match"]));
  });
});
