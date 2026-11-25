import type { ReaderSummaryCitation } from "../entities/citation";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { buildReaderSummaryTopicMap } from "./reader-summary-topic-map-builder";

describe("reader summary topic map semantic alignment", () => {
  it("grounds semantic subjects and claim facets in cluster evidence", () => {
    const feedItemId = "feed-codex-work-commentary";
    const map = buildReaderSummaryTopicMap({
      clusters: [storyCluster(feedItemId)],
      selectedEvidence: [evidenceItem(feedItemId)],
      topStories: [],
      citationMap: [citation(feedItemId)],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:codex-work-commentary",
            topicId: "topic:codex-work-commentary",
            label: "Codex core Availability",
            semantic: {
              subject: "Codex core",
              claimType: "availability",
              confidenceScore: 0.9,
            },
            groupId: "group:openai",
          },
        ],
        groups: [],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.nodes).toHaveLength(1);
    expect(map.nodes[0]?.label).toBe("Codex");
  });
});

const storyCluster = (feedItemId: string): StoryCluster => ({
  id: "story:codex-work-commentary",
  storyKey: "codex-work-commentary",
  rankingPolicyVersion: "story_ranking_v7",
  representativeFeedItemId: feedItemId,
  duplicateFeedItemIds: [],
  interestIds: ["ai-agents"],
  providerKeys: ["x-twitter"],
  score: 0.8,
  observedAtRange: {
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-09T01:00:00.000Z"),
  },
  whyImportant: ["Selected by ranking"],
});

const evidenceItem = (feedItemId: string): SummaryEvidenceItem => ({
  feedItemId,
  sourceItemId: feedItemId,
  sourceBindingId: "source-binding-x",
  interestId: "ai-agents",
  providerKey: "x-twitter",
  canonicalUrl: "https://example.test/codex-work-commentary",
  title: "X post by @sama: check this out!",
  bodyPreview:
    "Codex is the core of our new work product and is not going anywhere.",
  publishedAt: new Date("2026-07-09T00:00:00.000Z"),
  observedAt: new Date("2026-07-09T00:10:00.000Z"),
  score: 0.8,
  whyImportant: ["Matches monitored interest"],
});

const citation = (feedItemId: string): ReaderSummaryCitation => ({
  citationId: "citation:codex-work-commentary",
  feedItemId,
  sourceItemId: feedItemId,
  providerKey: "x-twitter",
  field: "bodyPreview",
  canonicalUrl: "https://example.test/codex-work-commentary",
});
