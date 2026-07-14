import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeTopStories } from "./openai-responses-reader-summary-story-normalizer";

describe("normalizeTopStories coverage alignment", () => {
  it("adds the approved coverage lead when the model returns eight other stories", () => {
    const input = modelInput(9);
    const citations = citationMap(9);
    const rawStories = Array.from({ length: 8 }, (_, index) => ({
      storyClusterId: `story:${index + 1}`,
      title: `Model story ${index + 1}`,
      summary: `Model description ${index + 1}`,
      interestIds: ["ai-developer-tools"],
      providerKeys: ["reddit"],
      citationIds: [`c${index + 1}`],
    }));

    const normalized = normalizeTopStories(rawStories, input, citations);

    expect(normalized[0]?.storyClusterId).toBe("story:9");
    expect(normalized.map((story) => story.storyClusterId)).toEqual(
      expect.arrayContaining([
        "story:1",
        "story:2",
        "story:3",
        "story:4",
        "story:5",
        "story:6",
        "story:7",
        "story:8",
        "story:9",
      ]),
    );
  });

  it("keeps top stories empty when no evidence passes the lead gate", () => {
    const input = {
      ...modelInput(1),
      coveragePlan: { mode: "single_story" as const, secondary: [] },
    };

    expect(
      normalizeTopStories(
        [
          {
            storyClusterId: "story:1",
            title: "Down-ranked story",
            summary: "The model must not restore this story.",
            interestIds: ["ai-developer-tools"],
            providerKeys: ["reddit"],
            citationIds: ["c1"],
          },
        ],
        input,
        citationMap(1),
      ),
    ).toEqual([]);
  });

  it("replaces a model story that combines citations from unrelated clusters", () => {
    const input = modelInput(2);
    const citations = citationMap(2);
    const rawStories = [
      {
        storyClusterId: "model-merged-story",
        title: "Research careers and a coding tool launch move together",
        summary:
          "The model combined two independent items into one unsupported story.",
        interestIds: ["ai-developer-tools"],
        providerKeys: ["reddit", "hacker-news"],
        citationIds: ["c1", "c2"],
      },
    ];

    const normalized = normalizeTopStories(rawStories, input, citations);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]?.storyClusterId).toBe("story:2");
    expect(normalized).not.toContainEqual(
      expect.objectContaining({
        title: "Research careers and a coding tool launch move together",
      }),
    );
    expect(normalized).toContainEqual(
      expect.objectContaining({
        storyClusterId: "story:1",
        title: "Evidence story 1",
        citationIds: ["c1"],
      }),
    );
    expect(normalized).toContainEqual(
      expect.objectContaining({
        storyClusterId: "story:2",
        title: "Evidence story 2",
        citationIds: ["c2"],
      }),
    );
  });

  it("completes cross-provider citation coverage from the same cluster", () => {
    const input = modelInputWithCrossProviderDuplicate();
    const citations: readonly ReaderSummaryCitation[] = [
      ...citationMap(1),
      {
        citationId: "c2",
        feedItemId: "feed-1-hn",
        sourceItemId: "source-1-hn",
        providerKey: "hacker-news",
        field: "title",
        canonicalUrl: "https://news.ycombinator.com/item?id=1",
      },
      {
        citationId: "c3",
        feedItemId: "feed-1-rss",
        sourceItemId: "source-1-rss",
        providerKey: "rss",
        field: "title",
        canonicalUrl: "https://example.com/product-update",
      },
    ];

    const normalized = normalizeTopStories(
      [
        {
          storyClusterId: "model-invented-cluster",
          title: "One product update appears across three providers",
          summary:
            "All three citations discuss the same concrete product update.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["reddit", "hacker-news", "rss"],
          citationIds: ["c1", "c2"],
        },
      ],
      input,
      citations,
    );

    expect(normalized).toEqual([
      expect.objectContaining({
        storyClusterId: "story:1",
        summary:
          "All three citations discuss the same concrete product update.",
        providerKeys: ["reddit", "hacker-news", "rss"],
        citationIds: ["c1", "c2", "c3"],
      }),
    ]);
  });
});

const modelInput = (count: number): ReaderSummaryModelInput => {
  const selectedEvidence = Array.from({ length: count }, (_, index) => ({
    feedItemId: `feed-${index + 1}`,
    sourceItemId: `source-${index + 1}`,
    sourceBindingId: "binding-reddit",
    interestId: "ai-developer-tools",
    providerKey: "reddit",
    canonicalUrl: `https://reddit.example/post/${index + 1}`,
    title: `Evidence story ${index + 1}`,
    bodyPreview: `Evidence story ${index + 1} has useful context.`,
    publishedAt: new Date("2026-07-11T12:00:00.000Z"),
    observedAt: new Date("2026-07-11T12:05:00.000Z"),
    score: 2 - index * 0.01,
    whyImportant: ["Relevant AI developer workflow evidence"],
  }));
  const clusters = selectedEvidence.map((item, index) => ({
    id: `story:${index + 1}`,
    storyKey: `story-${index + 1}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: [item.interestId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: {
      startedAt: item.observedAt,
      endedAt: new Date(item.observedAt.getTime() + 1),
    },
    whyImportant: item.whyImportant,
  }));
  const evidence = {
    rankingPolicyVersion: "story_ranking_v8",
    sourceWindow: {
      windowId: "window",
      startedAt: new Date("2026-07-11T00:00:00.000Z"),
      endedAt: new Date("2026-07-12T00:00:00.000Z"),
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((cluster) => cluster.id),
    },
    clusters,
    selectedEvidence,
  };

  return {
    tenantId: tenantId("tenant-test"),
    workspaceId: workspaceId("workspace-test"),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-07-11T00:00:00.000Z"),
      endedAt: new Date("2026-07-12T00:00:00.000Z"),
      timezone: "UTC",
      periodKey: "daily:2026-07-11:UTC",
    },
    evidence,
    coveragePlan: {
      mode: "single_story",
      lead: {
        role: "lead",
        clusterId: `story:${count}`,
        score: clusters[count - 1]?.score ?? 1,
        feedItemIds: [`feed-${count}`],
        providerKeys: ["reddit"],
        interestIds: ["ai-developer-tools"],
        whyImportant: ["Approved editorial lead"],
      },
      secondary: [],
    },
    contextArtifacts: [],
    policy: {
      language: "auto",
      format: "executive_brief",
      tone: "analytical",
      maxStories: 10,
      includeRisks: true,
      includeInterestHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      rulesVersion: "reader_summary.rules.test",
    },
    requestedAt: new Date("2026-07-12T00:00:01.000Z"),
  };
};

const citationMap = (count: number): readonly ReaderSummaryCitation[] =>
  Array.from({ length: count }, (_, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: `feed-${index + 1}`,
    sourceItemId: `source-${index + 1}`,
    providerKey: "reddit",
    field: "title",
    canonicalUrl: `https://reddit.example/post/${index + 1}`,
  }));

const modelInputWithCrossProviderDuplicate = (): ReaderSummaryModelInput => {
  const input = modelInput(1);
  const leadEvidence = input.evidence.selectedEvidence[0];
  const cluster = input.evidence.clusters[0];
  if (leadEvidence === undefined || cluster === undefined) {
    throw new Error("Expected one evidence item and story cluster");
  }

  const duplicateEvidence = {
    ...leadEvidence,
    feedItemId: "feed-1-hn",
    sourceItemId: "source-1-hn",
    sourceBindingId: "binding-hacker-news",
    providerKey: "hacker-news",
    canonicalUrl: "https://news.ycombinator.com/item?id=1",
  };
  const rssEvidence = {
    ...leadEvidence,
    feedItemId: "feed-1-rss",
    sourceItemId: "source-1-rss",
    sourceBindingId: "binding-rss",
    providerKey: "rss",
    canonicalUrl: "https://example.com/product-update",
  };

  return {
    ...input,
    evidence: {
      ...input.evidence,
      sourceWindow: {
        ...input.evidence.sourceWindow,
        selectedFeedItemIds: [
          leadEvidence.feedItemId,
          "feed-1-hn",
          "feed-1-rss",
        ],
      },
      clusters: [
        {
          ...cluster,
          duplicateFeedItemIds: ["feed-1-hn", "feed-1-rss"],
          providerKeys: ["reddit", "hacker-news", "rss"],
        },
      ],
      selectedEvidence: [leadEvidence, duplicateEvidence, rssEvidence],
    },
    coveragePlan: {
      mode: "single_story",
      lead: {
        ...input.coveragePlan.lead!,
        feedItemIds: [leadEvidence.feedItemId, "feed-1-hn", "feed-1-rss"],
        providerKeys: ["reddit", "hacker-news", "rss"],
      },
      secondary: [],
    },
  };
};
