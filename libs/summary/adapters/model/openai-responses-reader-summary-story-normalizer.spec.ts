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
    const input = { ...modelInput(1), coveragePlan: { secondary: [] } };

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
      lead: {
        role: "lead",
        clusterId: "story:9",
        score: clusters[8]?.score ?? 1,
        feedItemIds: ["feed-9"],
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
