import { classifyFeedPromotionEligibility, FeedItem } from "@social-monitor/feed/domain";
import { FixedClock, tenantId, workspaceId, type JsonObject } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy, SourceContentSafetyPolicy } from "../../domain";
import { rankPromotionSnapshot } from "./rank-promotion-snapshot";

describe("promotion snapshot reader reasons", () => {
  it.each<[string, JsonObject, string]>([
    ["x-twitter", { kind: "x_post", contentKind: "original_post", likes: 124, reposts: 9 },
      "Recorded X engagement: 124 likes and 9 reposts."],
    ["reddit", { kind: "reddit_post", score: 87 }, "Recorded Reddit score: 87."],
    ["hacker-news", { kind: "hacker_news_story", points: 63 }, "Recorded Hacker News points: 63."],
    ["github-repo-radar", { kind: "github_repository_trend", repository: {},
      trend: { primaryWindow: "24h", checkedAt: "2026-09-06T12:00:00.000Z", stars24h: 42, forks24h: 8 } },
    "Recorded GitHub star activity: 42 over 24h."],
  ])("explains %s using canonical counts while retaining sanitized, identity-bound source", async (
    providerKey, providerMetadata, expected,
  ) => {
    const tenant = tenantId("reason-test");
    const workspace = workspaceId("reason-test");
    const now = new Date("2026-09-06T12:00:00.000Z");
    const item = FeedItem.publish({
      id: "lead", tenantId: tenant, workspaceId: workspace,
      sourceItemId: "source-lead", sourceBindingId: "binding", interestId: "agents",
      providerKey, providerMetadata, canonicalUrl: "https://example.test/lead",
      title: "Agent session results", bodyPreview: "Agent sessions retain tool results. token=fixture-secret",
      publishedAt: now, observedAt: now,
    });
    const canonical = classifyFeedPromotionEligibility({ providerKey, providerMetadata });
    if (!canonical.eligible) throw new Error("Expected eligible fixture metrics");
    const result = await rankPromotionSnapshot({
      command: { tenantId: tenant, workspaceId: workspace, limit: 1,
        publishedAtOrAfter: new Date("2026-09-06T00:00:00.000Z"),
        publishedBefore: new Date("2026-09-07T00:00:00.000Z") },
      feedItems: {
        list: async () => ({ items: [] }),
        findById: async (query) => query.tenantId === tenant &&
          query.workspaceId === workspace && query.feedItemId === "lead" ? item : null,
        readPromotionSnapshot: async () => ({
          ok: true, candidates: [{ item, canonical }], physicalRowsRead: 1, exhausted: true,
          sourceContent: [{ feedItemId: "lead", sourceItemId: "source-lead", body: item.toSnapshot().bodyPreview }],
        }),
      }, clock: new FixedClock(now),
      qualityPolicy: new SourceContentQualityPolicy(), safetyPolicy: new SourceContentSafetyPolicy(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]).toMatchObject({
      feedItemId: "lead", sourceItemId: "source-lead", whyImportant: [expected], rank: 1,
    });
    expect(result.value.items[0]?.sourceText).toContain("Agent sessions retain tool results.");
    expect(JSON.stringify(result.value)).not.toMatch(/fixture-secret|promotion snapshot candidate/iu);
  });
});
