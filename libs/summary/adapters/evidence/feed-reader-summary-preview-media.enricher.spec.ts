import { FeedItem } from "@social-monitor/feed/domain";
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "@social-monitor/feed/ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact, type ReaderSummaryContent } from "../../domain";
import { FeedReaderSummaryPreviewMediaEnricher } from "./feed-reader-summary-preview-media.enricher";

describe("FeedReaderSummaryPreviewMediaEnricher", () => {
  it("fills missing top-read preview media from real feed item metadata", async () => {
    const feedItems = new FakeFeedItemReadRepository([
      FeedItem.publish({
        id: "feed-reddit",
        tenantId: tenant,
        workspaceId: workspace,
        interestId: "interest-ai",
        sourceItemId: "source-reddit",
        sourceBindingId: "binding-reddit",
        providerKey: "reddit",
        canonicalUrl: "https://www.reddit.com/r/example/comments/1/post/",
        title: "AI tooling library is trending",
        bodyPreview: "Reddit discussion with media.",
        publishedAt: new Date("2026-06-23T08:10:00.000Z"),
        observedAt: new Date("2026-06-23T08:12:00.000Z"),
        providerMetadata: {
          kind: "reddit_post",
          previewImageUrl: "https://preview.redd.it/real-image.png",
          thumbnailUrl: "https://b.thumbs.redditmedia.com/fallback.jpg",
          postHint: "image",
        },
      }),
    ]);
    const content = readerSummaryContent();

    await expect(
      new FeedReaderSummaryPreviewMediaEnricher(feedItems).enrich({
        artifact: readerSummaryArtifact(),
        content,
      }),
    ).resolves.toMatchObject({
      topReads: [
        {
          previewMedia: {
            kind: "image",
            url: "https://preview.redd.it/real-image.png",
            sourceUrl: "https://www.reddit.com/r/example/comments/1/post/",
            altText: "AI tooling library is trending",
          },
        },
      ],
    });
  });
});

const tenant = tenantId("tenant-reader-summary-preview-media");
const workspace = workspaceId("workspace-reader-summary-preview-media");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey:
    "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

const readerSummaryContent = (): ReaderSummaryContent => ({
  headline: "Workspace AI tooling reader summary",
  oneLineTakeaway: "AI tooling discussion is repeating.",
  bullets: ["Developers are discussing a new AI tooling library."],
  qualityState: {
    status: "ready",
    flags: [],
    warnings: [],
    isSingleSource: false,
  },
  interestSections: [],
  sourceMix: [
    {
      providerKey: "reddit",
      itemCount: 1,
      citationCount: 1,
      storyClusterCount: 1,
      crossSourceClusterCount: 0,
      singleSourceOnly: true,
      interestIds: ["interest-ai"],
    },
  ],
  topReads: [
    {
      title: "AI tooling library is trending",
      providerKey: "reddit",
      providerName: "Reddit",
      primaryActionKind: "read_source",
      reason: "Direct citation backs the top read.",
      matchedInterestIds: ["interest-ai"],
      matchedRules: ["ai-tooling"],
      signalScore: 0.91,
      confidence: {
        level: "medium",
        score: 0.72,
        rationale: "Direct citation backs the top read.",
      },
      confirmedProviderKeys: ["reddit"],
      providerMetrics: [],
      whyImportant: ["Reddit discussion with media."],
      whyNow: "It appeared in the current reader summary window.",
      citationIds: ["c1"],
    },
  ],
  trendDelta: {
    newSignals: [],
    growingSignals: [],
    repeatedSignals: [],
    fadingSignals: [],
  },
  openQuestions: [],
  risks: [],
  nextActions: [],
});

const readerSummaryArtifact = (): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: "reader-summary-1",
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    sourceWindow: {
      windowId: "workspace:get",
      startedAt: new Date("2026-06-23T08:00:00.000Z"),
      endedAt: new Date("2026-06-23T08:30:00.000Z"),
      selectedFeedItemIds: ["feed-reddit"],
      storyClusterIds: ["story:ai-tooling"],
    },
    storyClusters: [
      {
        id: "story:ai-tooling",
        storyKey: "url:example.com/ai-tooling",
        representativeFeedItemId: "feed-reddit",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        score: 1.4,
        observedAtRange: {
          startedAt: new Date("2026-06-23T08:00:00.000Z"),
          endedAt: new Date("2026-06-23T08:30:00.000Z"),
        },
        whyImportant: ["Reddit discussion with media."],
      },
    ],
    contextArtifacts: [],
    headline: "Workspace AI tooling reader summary",
    executiveSummary: "AI tooling discussion is repeating.",
    content: readerSummaryContent(),
    topStories: [
      {
        storyClusterId: "story:ai-tooling",
        title: "AI tooling library is trending",
        summary: "Developers are discussing a new AI tooling library.",
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        citationIds: ["c1"],
      },
    ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "c1",
        feedItemId: "feed-reddit",
        sourceItemId: "source-reddit",
        providerKey: "reddit",
        field: "title",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "medium",
      score: 0.72,
      rationale: "Evidence is available.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "fake-model",
      providerVersion: "fake",
      rulesVersion: "reader_summary.rules.test.v1",
      evalDatasetVersion: "reader_summary.eval.test.v1",
    },
    usage: {
      inputTokens: 20,
      outputTokens: 10,
      estimatedCostUsd: 0,
    },
  });

class FakeFeedItemReadRepository implements FeedItemReadRepositoryPort {
  private readonly itemsById = new Map<string, FeedItem>();

  constructor(items: readonly FeedItem[]) {
    for (const item of items) {
      const snapshot = item.toSnapshot();
      this.itemsById.set(
        [snapshot.tenantId, snapshot.workspaceId, snapshot.id].join(":"),
        item,
      );
    }
  }

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    void query;
    return { items: [] };
  }

  async findById(query: {
    tenantId: string;
    workspaceId: string;
    feedItemId: string;
  }): Promise<FeedItem | null> {
    return (
      this.itemsById.get(
        [query.tenantId, query.workspaceId, query.feedItemId].join(":"),
      ) ?? null
    );
  }
}
