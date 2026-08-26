import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import {
  FixedClock,
  tenantId,
  workspaceId,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import { buildReaderPostPromotionProjection } from "../../domain";
import type {
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
} from "../../ports";
import { FakeStoryRankingMetrics } from "./relevance-reader-summary-evidence-test-fixtures";

describe("reader-summary promotion upstream scan exhaustion", () => {
  it("finds originals behind more than 1,000 forbidden conversation units", async () => {
    const tenant = tenantId("tenant-promotion-scan-exhaustion");
    const workspace = workspaceId("workspace-promotion-scan-exhaustion");
    const repository = new InMemoryFeedItemReadRepository();
    const now = new Date("2026-08-18T12:00:00.000Z");

    for (let index = 0; index < 1_004; index += 1) {
      const forbidden = forbiddenConversationUnit(index);
      repository.upsert(FeedItem.publish({
        id: `forbidden-${index.toString().padStart(4, "0")}`,
        tenantId: tenant,
        workspaceId: workspace,
        interestId: "interest-ai",
        sourceItemId: `forbidden-source-${index}`,
        sourceBindingId: `forbidden-binding-${forbidden.providerKey}`,
        providerKey: forbidden.providerKey,
        canonicalUrl: `https://fixture.test/conversation/${index}`,
        title: `Forbidden conversation unit ${index}`,
        bodyPreview: "Conversation-only context must not enter promotion.",
        publishedAt: new Date(now.getTime() - 60_000 - index),
        observedAt: new Date(now.getTime() - 30_000 - index),
        providerMetadata: forbidden.providerMetadata,
      }));
    }
    publishOriginal(repository, {
      id: "eligible-reddit-original",
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: "reddit",
      title: "Database release improves transaction recovery",
      publishedAt: new Date("2026-08-18T09:00:00.000Z"),
      providerMetadata: { kind: "reddit_post", score: 80, comments: 0 },
    });
    publishOriginal(repository, {
      id: "eligible-normalized-x-original",
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: "  X-Twitter  ",
      title: "Agent runtime release adds deterministic recovery",
      publishedAt: new Date("2026-08-18T07:00:00.000Z"),
      providerMetadata: {
        kind: "twitter_post",
        contentKind: "original_post",
        likes: 40,
        reposts: 10,
      },
    });
    publishOriginal(repository, {
      id: "eligible-hn-original",
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: "hacker-news",
      title: "Compiler release adds deterministic build diagnostics",
      publishedAt: new Date("2026-08-18T08:00:00.000Z"),
      providerMetadata: {
        kind: "hacker_news_story",
        points: 70,
        comments: 0,
      },
    });

    const ranker = new RankFeedItemsUseCase(
      repository,
      new InMemoryUserRelevanceProfileRepository(),
      new FixedClock(now),
    );
    const ranked = await ranker.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-ai",
      limit: 50,
      observedAtOrAfter: new Date("2026-08-18T00:00:00.000Z"),
      observedBefore: new Date("2026-08-18T12:00:00.001Z"),
      rankingProfile: "reader_post_promotion",
    });

    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value.items.map((item) => item.feedItemId).sort()).toEqual([
      "eligible-hn-original",
      "eligible-normalized-x-original",
      "eligible-reddit-original",
    ]);

    const selection = await new RelevanceReaderSummaryEvidenceSelector(
      ranker,
      repository,
      new FixedClock(now),
      new FakeStoryRankingMetrics(),
    ).select({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "interest", interestId: "interest-ai" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-08-18T00:00:00.000Z"),
        endedAt: new Date("2026-08-19T00:00:00.000Z"),
        timezone: "UTC",
        periodKey:
          "daily:2026-08-18T00:00:00.000Z:2026-08-19T00:00:00.000Z:UTC",
      },
      observedThrough: now,
      maxItems: 3,
    });

    const snapshot = await repository.readPromotionSnapshot!({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-ai",
      timestampPolicy: "published_at",
      windowStartedAt: new Date("2026-08-18T00:00:00.000Z"),
      windowEndedAt: new Date("2026-08-19T00:00:00.000Z"),
      observedThrough: now,
    });
    expect(snapshot.ok && snapshot.candidates.map((candidate) =>
      candidate.item.toSnapshot().id).sort()).toEqual([
      "eligible-hn-original",
      "eligible-normalized-x-original",
      "eligible-reddit-original",
    ]);
    expect(selection.selectedEvidence.map((item) => item.feedItemId))
      .toEqual(["eligible-normalized-x-original"]);
  });

  it("rejects conflicting and malformed canonical metrics through ranking and selection", async () => {
    const tenant = tenantId("tenant-promotion-metric-validation");
    const workspace = workspaceId("workspace-promotion-metric-validation");
    const repository = new InMemoryFeedItemReadRepository();
    const now = new Date("2026-08-18T12:00:00.000Z");
    const invalid = [
      ["x-conflict", "x-twitter", {
        kind: "x_post", contentKind: "original_post", likes: 10, reposts: 1,
        publicMetrics: { like_count: 11, retweet_count: 1 },
      }],
      ["x-malformed", "x-twitter", {
        kind: "x_post", contentKind: "original_post", likes: "many", reposts: 1,
      }],
      ["reddit-conflict", "reddit", {
        kind: "reddit_post", score: 10, providerScore: 11, comments: 1,
      }],
      ["reddit-malformed", "reddit", {
        kind: "reddit_post", score: "many", comments: "many",
      }],
      ["hn-conflict", "hacker-news", {
        kind: "hacker_news_story", points: "conflict",
      }],
      ["hn-malformed", "hacker-news", {
        kind: "hacker_news_story", points: "many",
      }],
      ["github-conflict", "github_radar", {
        kind: "github_repository_trend",
        repository: { forksCount: 1 },
        trend: { ...githubTrend(10, 1), stars24h: "conflict" },
      }],
      ["github-malformed", "github-repo-radar", {
        kind: "github_repository_trend",
        repository: { forksCount: 1 },
        trend: { ...githubTrend(10, 1), forks24h: "many" },
      }],
    ] as const;
    invalid.forEach(([id, providerKey, providerMetadata], index) =>
      publishOriginal(repository, {
        id,
        tenantId: tenant,
        workspaceId: workspace,
        providerKey,
        title: `Invalid metric candidate ${id}`,
        publishedAt: new Date(now.getTime() - index * 1_000),
        providerMetadata,
      }));
    publishOriginal(repository, {
      id: "valid-reddit-original",
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: "reddit",
      title: "Valid canonical metric candidate",
      publishedAt: new Date("2026-08-18T10:00:00.000Z"),
      providerMetadata: { kind: "reddit_post", score: 20, comments: 2 },
    });
    const ranker = new RankFeedItemsUseCase(
      repository,
      new InMemoryUserRelevanceProfileRepository(),
      new FixedClock(now),
    );
    const ranked = await ranker.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-ai",
      limit: 20,
      observedAtOrAfter: new Date("2026-08-18T00:00:00.000Z"),
      observedBefore: new Date("2026-08-18T12:00:00.001Z"),
      rankingProfile: "reader_post_promotion",
    });
    expect(ranked.ok).toBe(true);
    expect(ranked.ok ? ranked.value.items.map((item) => item.feedItemId) : [])
      .toEqual(["valid-reddit-original"]);

    const selection = await new RelevanceReaderSummaryEvidenceSelector(
      ranker,
      repository,
      new FixedClock(now),
      new FakeStoryRankingMetrics(),
    ).select({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "interest", interestId: "interest-ai" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-08-18T00:00:00.000Z"),
        endedAt: new Date("2026-08-19T00:00:00.000Z"),
        timezone: "UTC",
        periodKey:
          "daily:2026-08-18T00:00:00.000Z:2026-08-19T00:00:00.000Z:UTC",
      },
      observedThrough: now,
      maxItems: 10,
    });
    expect(selection.selectedEvidence.map((item) => item.feedItemId))
      .toEqual([]);
  });

  it("preserves an authoritative winner and support below former 200/120 caps", async () => {
    const tenant = tenantId("tenant-pre-cap-promotion");
    const workspace = workspaceId("workspace-pre-cap-promotion");
    const repository = new InMemoryFeedItemReadRepository();
    const now = new Date("2026-08-18T12:00:00.000Z");
    for (let index = 0; index < 240; index += 1) {
      publishOriginal(repository, {
        id: `recent-valid-${index.toString().padStart(3, "0")}`,
        tenantId: tenant,
        workspaceId: workspace,
        providerKey: "reddit",
        title: `Unrelated database ecosystem update ${index}`,
        publishedAt: new Date(now.getTime() - index * 1_000),
        providerMetadata: {
          kind: "reddit_post",
          score: 30,
          comments: 2,
        },
      });
    }
    publishOriginal(repository, {
      id: "authoritative-winner-below-caps",
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: "x-twitter",
      title: "Cursor deployed at SpaceX latest",
      canonicalUrl: "https://x.com/acme/status/primary-recall",
      publishedAt: new Date("2026-08-18T08:00:00.000Z"),
      providerMetadata: {
        kind: "x_post",
        contentKind: "original_post",
        likes: 500,
        reposts: 100,
        promotionAuthority: {
          official: true,
          trusted: true,
          attestedBy: "source_catalog",
        },
      },
    });
    publishOriginal(repository, {
      id: "independent-support-below-caps",
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: "hacker-news",
      title: "SpaceX deploying Cursor for engineers",
      canonicalUrl: "https://news.ycombinator.com/item?id=424242",
      publishedAt: new Date("2026-08-18T07:59:00.000Z"),
      providerMetadata: {
        kind: "hacker_news_story",
        points: 30,
        comments: 4,
        promotionAuthority: {
          official: false,
          trusted: true,
          attestedBy: "source_catalog",
        },
      },
    });
    const ranker = new RankFeedItemsUseCase(
      repository,
      new InMemoryUserRelevanceProfileRepository(),
      new FixedClock(now),
    );
    const verifier = new ExactSupportVerifier();
    const selection = await new RelevanceReaderSummaryEvidenceSelector(
      ranker,
      repository,
      new FixedClock(now),
      new FakeStoryRankingMetrics(),
      verifier,
    ).select({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "interest", interestId: "interest-ai" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-08-18T00:00:00.000Z"),
        endedAt: new Date("2026-08-19T00:00:00.000Z"),
        timezone: "UTC",
        periodKey: "daily:pre-cap-promotion",
      },
      observedThrough: now,
      maxItems: 120,
    });
    const projection = buildReaderPostPromotionProjection({
      evidence: selection.selectedEvidence,
      clusters: selection.clusters,
      citations: selection.selectedEvidence.map((item) => ({
        citationId: `citation:${item.feedItemId}`,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "canonicalUrl",
        canonicalUrl: item.canonicalUrl,
      })),
      sourceWindow: selection.sourceWindow,
      approvedSameStoryRelations: selection.approvedSameStoryRelations,
    });

    expect(verifier.requestedPairs).toContain(
      "authoritative-winner-below-caps\u0000independent-support-below-caps");
    expect(selection.approvedSameStoryRelations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        leftFeedItemId: expect.stringMatching(/authoritative|independent/u),
        rightFeedItemId: expect.stringMatching(/authoritative|independent/u),
        verificationLane: "semantic_primary",
        executionAttestationSha256: "b".repeat(64),
      }),
    ]));
    expect(projection.topReads[0]?.promotionCandidateId)
      .toBe("authoritative-winner-below-caps");
    expect(projection.topReads[0]?.citationIds).toEqual(expect.arrayContaining([
      "citation:authoritative-winner-below-caps",
      "citation:independent-support-below-caps",
    ]));
    expect(selection.selectedEvidence.map((item) => item.feedItemId))
      .toEqual(expect.arrayContaining([
        "authoritative-winner-below-caps",
        "independent-support-below-caps",
      ]));
  });
});

class ExactSupportVerifier implements ReaderSummaryStoryRelationVerifierPort {
  readonly guardedPrimaryRecallCertification = "agent_runtime_attested_v1" as const;
  readonly requestedPairs: string[] = [];

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    this.requestedPairs.push(...input.candidates.map((candidate) =>
      [candidate.leftFeedItemId, candidate.rightFeedItemId].sort().join("\u0000")));
    return {
      verificationLane: input.verificationLane,
      decisions: input.candidates.map((candidate) => {
      const ids = new Set([
        candidate.leftFeedItemId,
        candidate.rightFeedItemId,
      ]);
      const exact = ids.has("authoritative-winner-below-caps") &&
        ids.has("independent-support-below-caps");
      return {
        leftFeedItemId: candidate.leftFeedItemId,
        rightFeedItemId: candidate.rightFeedItemId,
        sameStory: exact,
        confidenceScore: exact ? 0.99 : 0.1,
      };
      }),
      proof: {
        normalizedOutputSha256: "a".repeat(64),
        executionAttestationSha256: "b".repeat(64),
        selectedOutputSha256: "c".repeat(64),
      },
    };
  }
}

const githubTrend = (stars24h: number, forks24h: number): JsonObject => ({
  primaryWindow: "24h",
  checkedAt: "2026-08-18T11:00:00.000Z",
  stars24h,
  forks24h,
});

const forbiddenConversationUnit = (index: number): {
  readonly providerKey: string;
  readonly providerMetadata: JsonObject;
} => {
  switch (index % 8) {
    case 0:
      return {
        providerKey: "reddit",
        providerMetadata: {
          kind: "reddit_comment",
          role: "reply",
          score: 1_000_000,
          replies: 500_000,
        },
      };
    case 1:
      return {
        providerKey: "hacker-news",
        providerMetadata: {
          kind: "hacker_news_comment",
          role: "reply",
          points: 1_000_000,
          depth: 2,
        },
      };
    case 2:
      return {
        providerKey: "x-twitter",
        providerMetadata: {
          kind: "x_post",
          contentKind: "reply",
          likes: 1_000_000,
          reposts: 500_000,
          bookmarks: 250_000,
        },
      };
    case 3:
      return {
        providerKey: "x-twitter",
        providerMetadata: {
          kind: "x_post",
          contentKind: "quote",
          likes: 1_000_000,
          reposts: 500_000,
          bookmarks: 250_000,
        },
      };
    case 4:
      return {
        providerKey: "unknown-network",
        providerMetadata: { kind: "original_post", likes: 1_000_000 },
      };
    case 5:
      return {
        providerKey: "reddit",
        providerMetadata: { score: 1_000_000, comments: 500_000 },
      };
    case 6:
      return {
        providerKey: "reddit",
        providerMetadata: {
          kind: "reddit_post", score: "1000000", comments: 500_000,
        },
      };
    default:
      return {
        providerKey: "reddit",
        providerMetadata: {
          kind: "x_post",
          contentKind: "original_post",
          likes: 1_000_000,
          reposts: 500_000,
        },
      };
  }
};

const publishOriginal = (
  repository: InMemoryFeedItemReadRepository,
  params: {
    readonly id: string;
    readonly tenantId: ReturnType<typeof tenantId>;
    readonly workspaceId: ReturnType<typeof workspaceId>;
    readonly providerKey: string;
    readonly title: string;
    readonly canonicalUrl?: string;
    readonly publishedAt: Date;
    readonly providerMetadata: JsonObject;
  },
): void => repository.upsert(FeedItem.publish({
  ...params,
  interestId: "interest-ai",
  sourceItemId: `${params.id}:source`,
  sourceBindingId: `${params.id}:binding`,
  canonicalUrl: params.canonicalUrl ?? `https://fixture.test/original/${params.id}`,
  bodyPreview: "Original release evidence eligible for reader promotion.",
  observedAt: new Date(params.publishedAt.getTime() + 60_000),
}));
