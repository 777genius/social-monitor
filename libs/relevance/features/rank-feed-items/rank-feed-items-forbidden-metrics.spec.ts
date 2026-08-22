import { classifyFeedPromotionEligibility, FeedItem } from
  "@social-monitor/feed/domain";
import type {
  FeedItemReadRepositoryPort,
} from "@social-monitor/feed/ports";
import {
  FixedClock,
  tenantId,
  workspaceId,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import type { UserRelevanceProfileRepositoryPort } from "../../ports";
import { RankFeedItemsUseCase } from "./rank-feed-items.use-case";

describe("RankFeedItemsUseCase forbidden promotion metrics", () => {
  it.each([
    ["x-twitter", {
      kind: "x_post", contentKind: "original_post", likes: 80, reposts: 20,
    }, {
      kind: "x_post", contentKind: "original_post", likes: 80, reposts: 20,
      replies: -1, quotes: "malformed", bookmarks: Number.MAX_SAFE_INTEGER,
      impressions: { conflicting: true },
    }],
    ["reddit", { kind: "reddit_post", score: 90, upvoteRatio: 0.9 }, {
      kind: "reddit_post", score: 90, upvoteRatio: 0.9,
      comments: -1, numComments: "extreme",
    }],
    ["hacker-news", { kind: "hacker_news_story", points: 100 }, {
      kind: "hacker_news_story", points: 100,
      comments: { missing: false, conflicting: Number.MAX_VALUE },
    }],
  ] as const)(
    "keeps %s promotion rank output byte-identical under forbidden metrics",
    async (providerKey, baseline, mutated) => {
      expect(await rank(providerKey, mutated)).toBe(
        await rank(providerKey, baseline),
      );
    },
  );
});

const rank = async (
  providerKey: string,
  providerMetadata: JsonObject,
): Promise<string> => {
  const tenant = tenantId("tenant-forbidden-metamorphic");
  const workspace = workspaceId("workspace-forbidden-metamorphic");
  const item = FeedItem.publish({
    id: "feed-forbidden-metamorphic",
    tenantId: tenant,
    workspaceId: workspace,
    interestId: "interest-forbidden-metamorphic",
    sourceItemId: "feed-forbidden-metamorphic:source",
    sourceBindingId: `${providerKey}:binding`,
    providerKey,
    title: "Stable promotion candidate",
    bodyPreview: "The canonical ranking input is unchanged.",
    canonicalUrl: "https://example.test/stable-promotion",
    publishedAt: new Date("2026-08-18T10:00:00.000Z"),
    observedAt: new Date("2026-08-18T10:01:00.000Z"),
    providerMetadata,
  });
  const repository: FeedItemReadRepositoryPort = {
    list: async () => ({ items: [] }),
    readPromotionSnapshot: async () => {
      const snapshot = item.toSnapshot();
      const canonical = classifyFeedPromotionEligibility({
        providerKey: snapshot.providerKey,
        providerMetadata: snapshot.providerMetadata,
      });
      if (!canonical.eligible) throw new Error("fixture must be eligible");
      return { ok: true as const, candidates: [{ item, canonical }],
        sourceContent: [{
          feedItemId: snapshot.id,
          sourceItemId: snapshot.sourceItemId,
          body: snapshot.bodyPreview,
        }],
        physicalRowsRead: 1, exhausted: true as const };
    },
    findById: async () => null,
  };
  const profiles: UserRelevanceProfileRepositoryPort = {
    save: async () => undefined,
    findByUser: async () => null,
  };
  const result = await new RankFeedItemsUseCase(
    repository,
    profiles,
    new FixedClock(new Date("2026-08-19T00:00:00.000Z")),
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    interestId: "interest-forbidden-metamorphic",
    limit: 1,
    rankingProfile: "reader_post_promotion",
    publishedAtOrAfter: new Date("2026-08-18T00:00:00.000Z"),
    publishedBefore: new Date("2026-08-19T00:00:00.000Z"),
    observedBefore: new Date("2026-08-19T00:00:00.000Z"),
  });
  expect(result.ok).toBe(true);
  return JSON.stringify(result);
};
