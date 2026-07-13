import type { ReaderSummaryCitation } from "../entities/citation";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { buildReaderSummaryTopicMap } from "./reader-summary-topic-map-builder";

describe("reader summary topic map label deduplication", () => {
  it("merges identical labels returned with different topic ids", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        cluster("grok-cursor", "feed-cursor", "x-twitter"),
        cluster("grok-claude", "feed-claude", "reddit"),
      ],
      selectedEvidence: [
        evidence("feed-cursor", "Grok 4.5 on Cursor", "x-twitter"),
        evidence("feed-claude", "Grok 4.5 on Claude", "reddit"),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-cursor", "x-twitter"),
        citation("c2", "feed-claude", "reddit"),
      ],
      labelPlan: {
        nodeLabels: ["grok-cursor", "grok-claude"].map((id) => ({
          nodeId: `topic:story:${id}`,
          topicId: `topic:${id}`,
          label: "Grok 4.5",
          semantic: {
            subject: "Grok 4.5",
            claimType: "other" as const,
            confidenceScore: 0.9,
          },
          groupId: "group:grok",
        })),
        groups: [{ id: "group:grok", label: "Grok" }],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.nodes).toHaveLength(1);
    expect(map.nodes[0]).toMatchObject({
      label: "Grok 4.5",
      storyClusterIds: ["story:grok-cursor", "story:grok-claude"],
      providerKeys: ["x-twitter", "reddit"],
      citationIds: ["c1", "c2"],
    });
  });
});

const cluster = (
  id: string,
  feedItemId: string,
  providerKey: string,
): StoryCluster => ({
  id: `story:${id}`,
  storyKey: `story:${id}`,
  rankingPolicyVersion: "story_ranking_v9",
  representativeFeedItemId: feedItemId,
  duplicateFeedItemIds: [],
  interestIds: ["ai-agents"],
  providerKeys: [providerKey],
  score: 0.8,
  observedAtRange: {
    startedAt: new Date("2026-07-12T00:00:00.000Z"),
    endedAt: new Date("2026-07-12T23:59:59.999Z"),
  },
  whyImportant: ["Selected by ranking"],
});

const evidence = (
  feedItemId: string,
  title: string,
  providerKey: string,
): SummaryEvidenceItem => ({
  feedItemId,
  sourceItemId: `source:${feedItemId}`,
  sourceBindingId: `binding:${providerKey}`,
  interestId: "ai-agents",
  providerKey,
  title,
  canonicalUrl: `https://example.test/${feedItemId}`,
  bodyPreview: "Developer tooling discussion.",
  publishedAt: new Date("2026-07-12T12:00:00.000Z"),
  observedAt: new Date("2026-07-12T12:05:00.000Z"),
  score: 0.8,
  whyImportant: ["Matches monitored interest"],
});

const citation = (
  citationId: string,
  feedItemId: string,
  providerKey: string,
): ReaderSummaryCitation => ({
  citationId,
  feedItemId,
  sourceItemId: `source:${feedItemId}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});
