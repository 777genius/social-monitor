import { buildReaderSummaryTopicMap } from "./reader-summary-topic-map-builder";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCitation } from "../entities/citation";

describe("buildReaderSummaryTopicMap", () => {
  it("sizes nodes by cluster signal and groups LLM-labeled related topics", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:agents",
          score: 1.4,
          representativeFeedItemId: "feed-agent-1",
          duplicateFeedItemIds: ["feed-agent-2"],
          interestIds: ["ai-agents"],
          providerKeys: ["reddit", "hacker-news"],
        }),
        storyCluster({
          id: "story:codex",
          score: 0.6,
          representativeFeedItemId: "feed-codex",
          interestIds: ["ai-agents"],
          providerKeys: ["github-trending-page"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-agent-1",
          title: "AI coding agents are changing review workflows",
          providerKey: "reddit",
        }),
        evidenceItem({
          feedItemId: "feed-agent-2",
          title: "Developers compare agent workflows",
          providerKey: "hacker-news",
        }),
        evidenceItem({
          feedItemId: "feed-codex",
          title: "openai/codex leads developer tooling",
          providerKey: "github-trending-page",
        }),
      ],
      topStories: [
        {
          storyClusterId: "story:agents",
          title: "Agent workflows",
          summary: "Several sources discuss agent workflows.",
          interestIds: ["ai-agents"],
          providerKeys: ["reddit", "hacker-news"],
          citationIds: ["c1", "c2"],
        },
      ],
      citationMap: [
        citation("c1", "feed-agent-1", "reddit"),
        citation("c2", "feed-agent-2", "hacker-news"),
        citation("c3", "feed-codex", "github-trending-page"),
      ],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:agents",
            label: "AI agents",
            groupId: "group:agent-tools",
          },
          {
            nodeId: "topic:story:codex",
            label: "Codex",
            groupId: "group:agent-tools",
          },
        ],
        groups: [
          {
            id: "group:agent-tools",
            label: "Agent tools",
            confidenceScore: 0.91,
          },
        ],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.generatedBy).toBe("agent-runtime");
    expect(map.nodes.map((node) => node.label)).toEqual(["AI agents", "Codex"]);
    expect(map.nodes[0]?.popularityScore).toBeGreaterThan(
      map.nodes[1]?.popularityScore ?? 0,
    );
    expect(map.groups).toHaveLength(1);
    expect(map.groups[0]).toMatchObject({
      id: "group:agent-tools",
      label: "Agent tools",
      nodeIds: ["topic:story:agents", "topic:story:codex"],
    });
    expect(map.edges[0]).toMatchObject({
      sourceNodeId: "topic:story:agents",
      targetNodeId: "topic:story:codex",
      reason: "Same semantic topic group",
    });
  });

  it("groups deterministic fallback topics by content before interest", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-code",
          representativeFeedItemId: "feed-claude-code",
          interestIds: ["ai-agents"],
        }),
        storyCluster({
          id: "story:claude-cache",
          representativeFeedItemId: "feed-claude-cache",
          interestIds: ["ai-agents"],
        }),
        storyCluster({
          id: "story:palantir",
          representativeFeedItemId: "feed-palantir",
          interestIds: ["ai-agents"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-claude-code",
          title: "Claude Code agents reshape pull request review",
          providerKey: "hacker-news",
        }),
        evidenceItem({
          feedItemId: "feed-claude-cache",
          title: "Claude Code session cache improves agent workflows",
          providerKey: "reddit",
        }),
        evidenceItem({
          feedItemId: "feed-palantir",
          title: "Palantir earnings debate lifts developer interest",
          providerKey: "x-twitter",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-claude-code", "hacker-news"),
        citation("c2", "feed-claude-cache", "reddit"),
        citation("c3", "feed-palantir", "x-twitter"),
      ],
    });

    const claudeCode = map.nodes.find(
      (node) => node.id === "topic:story:claude-code",
    );
    const claudeCache = map.nodes.find(
      (node) => node.id === "topic:story:claude-cache",
    );
    const palantir = map.nodes.find(
      (node) => node.id === "topic:story:palantir",
    );

    expect(claudeCode?.groupId).toBe("topic:claude-code");
    expect(claudeCache?.groupId).toBe("topic:claude-code");
    expect(palantir?.groupId).toBe("topic:palantir");
    expect(new Set(map.nodes.map((node) => node.groupId)).size).toBe(2);
  });

  it("keeps flat single-item topic scores visually separable", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:first",
          representativeFeedItemId: "feed-first",
          score: 1,
        }),
        storyCluster({
          id: "story:second",
          representativeFeedItemId: "feed-second",
          score: 1,
        }),
        storyCluster({
          id: "story:third",
          representativeFeedItemId: "feed-third",
          score: 1,
        }),
        storyCluster({
          id: "story:fourth",
          representativeFeedItemId: "feed-fourth",
          score: 1,
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-first",
          title: "First ranked topic",
          providerKey: "hacker-news",
        }),
        evidenceItem({
          feedItemId: "feed-second",
          title: "Second ranked topic",
          providerKey: "reddit",
        }),
        evidenceItem({
          feedItemId: "feed-third",
          title: "Third ranked topic",
          providerKey: "rss",
        }),
        evidenceItem({
          feedItemId: "feed-fourth",
          title: "Fourth ranked topic",
          providerKey: "x-twitter",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-first", "hacker-news"),
        citation("c2", "feed-second", "reddit"),
        citation("c3", "feed-third", "rss"),
        citation("c4", "feed-fourth", "x-twitter"),
      ],
    });

    expect(map.nodes.map((node) => Math.round(node.popularityScore))).toEqual([
      100, 74, 48, 22,
    ]);
    expect(map.nodes[0]?.sizeWeight).toBeGreaterThan(
      map.nodes[3]?.sizeWeight ?? 0,
    );
  });

  it("does not surface source or UI meta labels as topic node labels", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:openai-routing",
          representativeFeedItemId: "feed-openai-routing",
          providerKeys: ["hacker-news"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-openai-routing",
          title: "OpenAI routing benchmark launch",
          providerKey: "hacker-news",
        }),
      ],
      topStories: [
        {
          storyClusterId: "story:openai-routing",
          title: "Reader Summary",
          summary: "A source item discusses OpenAI routing benchmarks.",
          interestIds: ["ai-agents"],
          providerKeys: ["hacker-news"],
          citationIds: ["c1"],
        },
      ],
      citationMap: [citation("c1", "feed-openai-routing", "hacker-news")],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:openai-routing",
            label: "Hacker News",
            groupId: "group:model-launches",
          },
        ],
        groups: [{ id: "group:model-launches", label: "Model launches" }],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.nodes[0]?.label).toBe("OpenAI routing benchmark launch");
  });
});

const storyCluster = (
  overrides: Partial<StoryCluster> & Pick<StoryCluster, "id">,
): StoryCluster => ({
  storyKey: overrides.id,
  rankingPolicyVersion: "story_ranking_v2",
  representativeFeedItemId: "feed-1",
  duplicateFeedItemIds: [],
  interestIds: ["interest-1"],
  providerKeys: ["reddit"],
  score: 0.5,
  observedAtRange: {
    startedAt: new Date("2026-06-01T00:00:00.000Z"),
    endedAt: new Date("2026-06-01T01:00:00.000Z"),
  },
  whyImportant: ["Selected by ranking"],
  ...overrides,
});

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem> &
    Pick<SummaryEvidenceItem, "feedItemId" | "title" | "providerKey">,
): SummaryEvidenceItem => ({
  sourceItemId: overrides.feedItemId,
  sourceBindingId: "source-binding-1",
  interestId: "ai-agents",
  canonicalUrl: `https://example.test/${overrides.feedItemId}`,
  bodyPreview: "Developer tooling discussion.",
  publishedAt: new Date("2026-06-01T00:00:00.000Z"),
  observedAt: new Date("2026-06-01T00:10:00.000Z"),
  score: 0.7,
  whyImportant: ["Matches monitored interest"],
  ...overrides,
});

const citation = (
  citationId: string,
  feedItemId: string,
  providerKey: string,
): ReaderSummaryCitation => ({
  citationId,
  feedItemId,
  sourceItemId: `${feedItemId}:source`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});
