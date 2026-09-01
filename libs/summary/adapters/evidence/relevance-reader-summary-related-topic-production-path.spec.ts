import { InMemoryFeedItemReadRepository } from
  "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import {
  ok,
  tenantId,
  workspaceId,
  type Clock,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import { aug14RelatedTopicEvidence } from "../../test-fixtures/aug-14-related-topic.fixture";
import type {
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
} from "../../ports";
import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";

describe("RelevanceReaderSummaryEvidenceSelector related-topic production path", () => {
  it("backs ranked context with a non-empty authoritative promotion snapshot", async () => {
    const repository = authoritativeFeedRepository();
    const snapshot = await repository.readPromotionSnapshot({
      tenantId: fixtureTenant,
      workspaceId: fixtureWorkspace,
      timestampPolicy: "published_at",
      windowStartedAt: new Date("2026-08-14T00:00:00.000Z"),
      windowEndedAt: new Date("2026-08-15T00:00:00.000Z"),
      observedThrough: now,
    });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.ok ? snapshot.candidates.map(({ item, canonical }) => ({
      id: item.toSnapshot().id,
      metrics: canonical.metrics,
    })).sort((left, right) => left.id.localeCompare(right.id)) : []).toEqual([
      {
        id: "aug14-watermark-hn",
        metrics: expect.objectContaining({ kind: "hacker_news_story", points: 500 }),
      },
      {
        id: "aug14-watermark-reddit",
        metrics: expect.objectContaining({ kind: "reddit_post", score: 7 }),
      },
    ]);
  });

  it("changes only the optional relation output when the verdict lane is enabled", async () => {
    const disabled = await selectWithRelationVerdict("unrelated", rankedEvidence());
    const enabled = await selectWithRelationVerdict("related_topic", rankedEvidence());

    expect(enabled.relatedTopicRelations).toHaveLength(1);
    expect(enabled.relatedTopicRelations?.[0]).toMatchObject({
      subjectFeedItemId: "aug14-watermark-reddit",
      subjectProviderKey: "reddit",
      subjectSourceItemId: "reddit-1mt-watermark-code",
      officialAnchorFeedItemId: "aug14-watermark-official",
      officialAnchorProviderKey: "rss",
      officialAnchorSourceItemId: "anthropic-text-watermarking",
      officialAnchorContentQuality: expect.objectContaining({
        eligibleForTopRead: true,
        flags: expect.arrayContaining(["official_account", "trusted_author"]),
      }),
      subjectIsOfficial: false,
      officialAnchorIsOfficial: true,
    });
    expect(withoutRelations(enabled)).toEqual(withoutRelations(disabled));
    expect(enabled.clusters).toEqual(disabled.clusters);
    expect(enabled.selectedEvidence).toEqual(disabled.selectedEvidence);
    expect(enabled.rankingPolicyVersion).toBe(disabled.rankingPolicyVersion);
    expect(enabled.editorialSlate?.orderedCandidateIds).toEqual([]);
    expect(enabled.selectedEvidence).toEqual([]);
  });

  it("is input-permutation stable and fails malformed or duplicate verdicts closed", async () => {
    const expected = await selectWithRelationVerdict(
      "related_topic",
      rankedEvidence(),
    );
    const permuted = await selectWithRelationVerdict(
      "related_topic",
      [...rankedEvidence()].reverse(),
    );
    expect(permuted.relatedTopicRelations).toEqual(expected.relatedTopicRelations);

    for (const mode of ["malformed", "duplicate"] as const) {
      const selection = await selectWithVerifier(new ProductionPathVerifier(mode));
      expect(selection.relatedTopicRelations).toEqual([]);
      expect(withoutRelations(selection)).toEqual(withoutRelations(expected));
    }
  });

  it("times out through select and preserves the complete non-related selection", async () => {
    const verifier = new ProductionPathVerifier("timeout");
    const timedOut = await selectWithVerifier(verifier, rankedEvidence(), 1);
    const disabled = await selectWithRelationVerdict("unrelated", rankedEvidence());

    expect(timedOut.relatedTopicRelations).toEqual([]);
    expect(verifier.relatedSignal?.aborted).toBe(true);
    expect(withoutRelations(timedOut)).toEqual(withoutRelations(disabled));
  });
});

const now = new Date("2026-08-14T18:00:00.000Z");
const clock: Clock = { now: () => now };
const fixtureTenant = tenantId("tenant-aug14-production");
const fixtureWorkspace = workspaceId("workspace-aug14-production");

const selectWithRelationVerdict = (
  verdict: "related_topic" | "unrelated",
  items: readonly RankedFeedItemView[],
) => selectWithVerifier(new ProductionPathVerifier(verdict), items);

const selectWithVerifier = (
  verifier: ReaderSummaryStoryRelationVerifierPort,
  items: readonly RankedFeedItemView[] = rankedEvidence(),
  relatedTopicTimeoutMs?: number,
) => new RelevanceReaderSummaryEvidenceSelector(
  ranker(items),
  authoritativeFeedRepository(),
  clock,
  undefined,
  verifier,
  relatedTopicTimeoutMs,
).select({
  tenantId: fixtureTenant,
  workspaceId: fixtureWorkspace,
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-08-14T00:00:00.000Z"),
    endedAt: new Date("2026-08-15T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "2026-08-14",
  },
  maxItems: 3,
  observedThrough: now,
});

class ProductionPathVerifier implements ReaderSummaryStoryRelationVerifierPort {
  constructor(
    private readonly mode:
      | "related_topic"
      | "unrelated"
      | "malformed"
      | "duplicate"
      | "timeout",
  ) {}

  relatedSignal?: AbortSignal;

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    if (input.verificationLane !== "related_topic") {
      return input.candidates.map((candidate) => ({
        leftFeedItemId: candidate.leftFeedItemId,
        rightFeedItemId: candidate.rightFeedItemId,
        sameStory: officialAndNewsPair(candidate.leftFeedItemId, candidate.rightFeedItemId),
        confidenceScore: 0.99,
      }));
    }
    this.relatedSignal = input.signal;
    if (this.mode === "timeout") {
      return new Promise<readonly unknown[]>(() => undefined);
    }
    if (this.mode === "malformed") return [{ unexpected: true }];
    const relation = this.mode === "unrelated" ? "unrelated" : "related_topic";
    const decisions = input.candidates.map((candidate) => ({
      leftFeedItemId: candidate.leftFeedItemId,
      rightFeedItemId: candidate.rightFeedItemId,
      relation,
      confidenceScore: 0.99,
    }));
    return this.mode === "duplicate" ? [...decisions, ...decisions] : decisions;
  }
}

const officialAndNewsPair = (left: string, right: string): boolean =>
  new Set([left, right]).size === 2 &&
  [left, right].includes("aug14-watermark-official") &&
  [left, right].includes("aug14-watermark-hn");

const ranker = (items: readonly RankedFeedItemView[]): RankFeedItemsUseCase => ({
  execute: async () => ok({
    generatedAt: now.toISOString(),
    profileApplied: false,
    items,
  }),
}) as unknown as RankFeedItemsUseCase;

const authoritativeFeedRepository = (): InMemoryFeedItemReadRepository => {
  const repository = new InMemoryFeedItemReadRepository();
  for (const item of aug14RelatedTopicEvidence()) {
    repository.upsert(FeedItem.publish({
      id: item.feedItemId,
      tenantId: fixtureTenant,
      workspaceId: fixtureWorkspace,
      interestId: item.interestId,
      sourceItemId: item.sourceItemId,
      sourceBindingId: item.sourceBindingId,
      providerKey: item.providerKey,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      bodyPreview: item.bodyPreview ?? "Synthetic related-topic fixture context.",
      publishedAt: item.publishedAt,
      observedAt: item.observedAt,
      providerMetadata: nativePromotionMetadata(item.feedItemId),
    }));
  }
  return repository;
};

const rankedEvidence = (): readonly RankedFeedItemView[] =>
  aug14RelatedTopicEvidence().map((item, index) => ({
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    sourceBindingId: item.sourceBindingId,
    interestId: item.interestId,
    providerKey: item.providerKey,
    providerMetadata: nativePromotionMetadata(item.feedItemId),
    canonicalUrl: item.canonicalUrl,
    title: item.title,
    bodyPreview: item.bodyPreview,
    publishedAt: item.publishedAt.toISOString(),
    observedAt: item.observedAt.toISOString(),
    score: item.score,
    rank: index + 1,
    clusterId: `source:${item.providerKey}:${item.sourceItemId}`,
    clusterSize: 1,
    duplicateFeedItemIds: [],
    whyImportant: item.whyImportant,
    contentQuality: {
      ...item.contentQuality!,
      decision: item.contentQuality!.decision === "promote"
        ? "promote" as const
        : "keep" as const,
    },
    safety: {
      status: "allowed",
      categories: ["raw_payload_retention_disabled"],
      rawPayloadRetained: false,
      retentionPolicy: "normalized_preview_only",
    },
  }));

const nativePromotionMetadata = (feedItemId: string): JsonObject => {
  switch (feedItemId) {
    case "aug14-watermark-hn":
      return { kind: "hacker_news_story", points: 500, comments: 12 };
    case "aug14-watermark-reddit":
      return { kind: "reddit_post", score: 7, comments: 5 };
    default:
      return { kind: "rss_entry" };
  }
};

const withoutRelations = <T extends { readonly relatedTopicRelations?: unknown }>(
  selection: T,
) => {
  const { relatedTopicRelations: ignored, ...rest } = selection;
  void ignored;
  return rest;
};
