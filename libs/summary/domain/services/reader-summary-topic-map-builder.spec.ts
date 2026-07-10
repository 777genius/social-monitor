import { buildReaderSummaryTopicMap } from "./reader-summary-topic-map-builder";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCitation } from "../entities/citation";
import { READER_SUMMARY_TOPIC_MAP_MAX_NODES } from "../policies/reader-summary-topic-map-grouping-policy";

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
          title: "openai/codex agent workflows for developer tooling",
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
            semanticAnchors: ["agent", "agent workflows"],
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
      label: "Agent Tools",
      nodeIds: ["topic:story:agents", "topic:story:codex"],
    });
    expect(map.edges).toEqual([]);
  });

  it("aggregates LLM-labeled same-topic clusters into one bubble", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-code-hn",
          score: 0.9,
          representativeFeedItemId: "feed-claude-code-hn",
          interestIds: ["ai-agents"],
          providerKeys: ["hacker-news"],
        }),
        storyCluster({
          id: "story:claude-code-reddit",
          score: 0.7,
          representativeFeedItemId: "feed-claude-code-reddit",
          interestIds: ["ai-agents"],
          providerKeys: ["reddit"],
        }),
        storyCluster({
          id: "story:openai-routing",
          score: 0.5,
          representativeFeedItemId: "feed-openai-routing",
          interestIds: ["ai-agents"],
          providerKeys: ["rss"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-claude-code-hn",
          title: "Claude Code adds agent workflow controls",
          providerKey: "hacker-news",
        }),
        evidenceItem({
          feedItemId: "feed-claude-code-reddit",
          title: "Developers compare Claude Code agent workflows",
          providerKey: "reddit",
        }),
        evidenceItem({
          feedItemId: "feed-openai-routing",
          title: "OpenAI routing benchmark launch",
          providerKey: "rss",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-claude-code-hn", "hacker-news"),
        citation("c2", "feed-claude-code-reddit", "reddit"),
        citation("c3", "feed-openai-routing", "rss"),
      ],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:claude-code-hn",
            topicId: "topic:claude-code-agents",
            label: "Claude Code",
            groupId: "group:claude",
          },
          {
            nodeId: "topic:story:claude-code-reddit",
            topicId: "topic:claude-code-agents",
            label: "Claude Code",
            groupId: "group:claude",
          },
          {
            nodeId: "topic:story:openai-routing",
            topicId: "topic:openai-routing",
            label: "OpenAI routing",
            groupId: "group:openai",
          },
        ],
        groups: [
          { id: "group:claude", label: "Claude" },
          { id: "group:openai", label: "OpenAI" },
        ],
      },
      generatedBy: "agent-runtime",
    });

    const claude = map.nodes.find((node) => node.label === "Claude Code");

    expect(map.nodes).toHaveLength(2);
    expect(claude).toMatchObject({
      groupId: "group:ungrouped",
      storyClusterIds: ["story:claude-code-hn", "story:claude-code-reddit"],
      evidenceCount: 2,
      providerKeys: ["hacker-news", "reddit"],
      citationIds: ["c1", "c2"],
    });
    expect(claude?.id).toBe(
      "topic:aggregate:llm-topic-topic-claude-code-agents",
    );
    expect(claude?.popularityScore).toBeGreaterThan(50);
    expect(claude?.sizeWeight).toBeGreaterThan(0.7);
  });

  it("aggregates deterministic groups when agent-runtime labeling returns no usable labels", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-code",
          representativeFeedItemId: "feed-claude-code",
          interestIds: ["ai-agents"],
          providerKeys: ["hacker-news"],
        }),
        storyCluster({
          id: "story:claude-cache",
          representativeFeedItemId: "feed-claude-cache",
          interestIds: ["ai-agents"],
          providerKeys: ["reddit"],
        }),
        storyCluster({
          id: "story:palantir",
          representativeFeedItemId: "feed-palantir",
          interestIds: ["ai-agents"],
          providerKeys: ["x-twitter"],
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
      labelPlan: { nodeLabels: [], groups: [] },
      generatedBy: "agent-runtime",
    });

    const claude = map.nodes.find((node) => node.label === "Claude Code");

    expect(map.nodes).toHaveLength(2);
    expect(claude).toMatchObject({
      groupId: "group:ungrouped",
      evidenceCount: 2,
      storyClusterIds: ["story:claude-code", "story:claude-cache"],
      providerKeys: ["hacker-news", "reddit"],
    });
    expect(map.edges).toHaveLength(0);
  });

  it("keeps parent and product fallback topics in the same color group", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-general",
          representativeFeedItemId: "feed-claude-general",
          interestIds: ["ai-agents"],
          providerKeys: ["rss"],
        }),
        storyCluster({
          id: "story:claude-code",
          representativeFeedItemId: "feed-claude-code",
          interestIds: ["ai-agents"],
          providerKeys: ["hacker-news"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-claude-general",
          title: "Claude model updates and agent workflow notes",
          providerKey: "rss",
        }),
        evidenceItem({
          feedItemId: "feed-claude-code",
          title: "Claude Code agents reshape pull request review",
          providerKey: "hacker-news",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-claude-general", "rss"),
        citation("c2", "feed-claude-code", "hacker-news"),
      ],
      labelPlan: { nodeLabels: [], groups: [] },
      generatedBy: "agent-runtime",
    });

    expect(map.nodes.map((node) => node.label)).toEqual([
      "Claude Agent",
      "Claude Code",
    ]);
    expect(new Set(map.nodes.map((node) => node.groupId))).toEqual(
      new Set(["group:claude"]),
    );
    expect(map.groups).toHaveLength(1);
  });

  it("merges deterministic fallback topics before applying group support", () => {
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

    const claudeCode = map.nodes.find((node) => node.label === "Claude Code");
    const palantir = map.nodes.find(
      (node) => node.id === "topic:story:palantir",
    );

    expect(claudeCode?.groupId).toBe("group:ungrouped");
    expect(claudeCode?.storyClusterIds).toEqual([
      "story:claude-code",
      "story:claude-cache",
    ]);
    expect(palantir?.groupId).toBe("group:ungrouped");
    expect(new Set(map.nodes.map((node) => node.groupId))).toEqual(
      new Set(["group:ungrouped"]),
    );
    expect(
      map.edges.every((edge) => {
        const source = map.nodes.find((node) => node.id === edge.sourceNodeId);

        return source?.groupId !== "group:ungrouped";
      }),
    ).toBe(true);
  });

  it("keeps equal topic evidence at equal popularity and size", () => {
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
      100, 100, 100, 100,
    ]);
    expect(new Set(map.nodes.map((node) => node.sizeWeight))).toEqual(
      new Set([1]),
    );
  });

  it("keeps secondary popularity signals separable under one dominant topic", () => {
    const scores = [12, 2.4, 2.2, 2, 1.8];
    const clusters = scores.map((score, index) =>
      storyCluster({
        id: `story:signal-${index}`,
        representativeFeedItemId: `feed-signal-${index}`,
        score,
      }),
    );
    const selectedEvidence = clusters.map((cluster, index) =>
      evidenceItem({
        feedItemId: cluster.representativeFeedItemId,
        title: `Project${index} runtime benchmark`,
        providerKey: "rss",
      }),
    );
    const map = buildReaderSummaryTopicMap({
      clusters,
      selectedEvidence,
      topStories: [],
      citationMap: selectedEvidence.map((item, index) =>
        citation(`c${index}`, item.feedItemId, item.providerKey),
      ),
    });

    expect(new Set(map.nodes.map((node) => node.popularityScore)).size).toBe(5);
    expect(map.nodes[1]?.popularityScore).toBeGreaterThan(23);
    expect(map.nodes.at(-1)?.popularityScore).toBe(18);
  });

  it("caps the published map before layout payloads become unbounded", () => {
    const clusters = Array.from({ length: 45 }, (_, index) =>
      storyCluster({
        id: `story:project-${index}`,
        representativeFeedItemId: `feed-project-${index}`,
        score: 1 - index / 100,
      }),
    );
    const selectedEvidence = clusters.map((cluster, index) =>
      evidenceItem({
        feedItemId: cluster.representativeFeedItemId,
        title: `Project${index} runtime signal`,
        providerKey: "rss",
      }),
    );
    const map = buildReaderSummaryTopicMap({
      clusters,
      selectedEvidence,
      topStories: [],
      citationMap: selectedEvidence.map((item, index) =>
        citation(`c${index}`, item.feedItemId, item.providerKey),
      ),
    });

    expect(map.nodes).toHaveLength(READER_SUMMARY_TOPIC_MAP_MAX_NODES);
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

    expect(map.nodes[0]?.label).toBe("OpenAI Routing Benchmark");
  });

  it("does not promote generic question words into topic labels or groups", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-cache-question",
          representativeFeedItemId: "feed-claude-cache-question",
          providerKeys: ["hacker-news"],
        }),
        storyCluster({
          id: "story:doj-amazon",
          representativeFeedItemId: "feed-doj-amazon",
          providerKeys: ["rss"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-claude-cache-question",
          title: "Ask HN: Why Claude Code cache feels slow",
          providerKey: "hacker-news",
        }),
        evidenceItem({
          feedItemId: "feed-doj-amazon",
          title: "The DOJ antitrust filing targets Amazon pricing",
          providerKey: "rss",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-claude-cache-question", "hacker-news"),
        citation("c2", "feed-doj-amazon", "rss"),
      ],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:claude-cache-question",
            topicId: "topic:why",
            label: "Why",
            groupId: "group:show",
            keywords: ["why", "the", "claude-code"],
          },
        ],
        groups: [{ id: "group:show", label: "Show" }],
      },
      generatedBy: "agent-runtime",
    });

    const weakLabels = new Set(["Ask", "How", "Show", "The", "What", "Why"]);

    expect(map.nodes.map((node) => node.label)).not.toEqual(
      expect.arrayContaining([...weakLabels]),
    );
    expect(map.groups.map((group) => group.label)).not.toEqual(
      expect.arrayContaining([...weakLabels]),
    );
    expect(map.nodes[0]?.label).toContain("Claude Code");
  });

  it("keeps broad LLM group labels separate from concrete bubble labels", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-code-cache",
          representativeFeedItemId: "feed-claude-code-cache",
          providerKeys: ["hacker-news"],
        }),
        storyCluster({
          id: "story:claude-permissions",
          representativeFeedItemId: "feed-claude-permissions",
          providerKeys: ["reddit"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-claude-code-cache",
          title: "Claude Code session cache improves agent workflows",
          providerKey: "hacker-news",
        }),
        evidenceItem({
          feedItemId: "feed-claude-permissions",
          title: "Claude permissions change agent workflows",
          providerKey: "reddit",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-claude-code-cache", "hacker-news"),
        citation("c2", "feed-claude-permissions", "reddit"),
      ],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:claude-code-cache",
            topicId: "topic:claude",
            label: "Claude",
            groupId: "group:claude",
            keywords: ["claude", "claude-code", "session-cache"],
          },
          {
            nodeId: "topic:story:claude-permissions",
            topicId: "topic:claude-permissions",
            label: "Claude Permissions",
            groupId: "group:claude",
            keywords: ["claude", "permissions"],
          },
        ],
        groups: [{ id: "group:claude", label: "Claude" }],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.nodes[0]?.label).toContain("Claude Code");
    expect(map.nodes[0]?.label).not.toBe("Claude");
    expect(map.nodes[0]?.groupId).toBe("group:claude");
    expect(map.groups[0]?.label).toBe("Claude");
  });

  it("omits candidates that were not reviewed by the configured labeler", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:reviewed",
          representativeFeedItemId: "feed-reviewed",
          score: 1,
        }),
        storyCluster({
          id: "story:not-reviewed",
          representativeFeedItemId: "feed-not-reviewed",
          score: 0.9,
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-reviewed",
          title: "Reviewed runtime topic",
          providerKey: "rss",
        }),
        evidenceItem({
          feedItemId: "feed-not-reviewed",
          title: "Unreviewed unrelated topic",
          providerKey: "reddit",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-reviewed", "rss"),
        citation("c2", "feed-not-reviewed", "reddit"),
      ],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:reviewed",
            label: "Runtime Topic",
            groupId: "group:runtime",
          },
        ],
        groups: [{ id: "group:runtime", label: "Runtime" }],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.nodes.map((node) => node.id)).toEqual(["topic:story:reviewed"]);
    expect(map.warnings).toEqual([
      expect.stringContaining("Omitted 1 lower-ranked topic candidate"),
    ]);
  });

  it("falls back to the semantic group id when an LLM group label is a headline", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-reflect",
          representativeFeedItemId: "feed-claude-reflect",
        }),
        storyCluster({
          id: "story:claude-limits",
          representativeFeedItemId: "feed-claude-limits",
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-claude-reflect",
          title: "Claude Reflect product release",
          providerKey: "rss",
        }),
        evidenceItem({
          feedItemId: "feed-claude-limits",
          title: "Claude usage limits reset",
          providerKey: "reddit",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-claude-reflect", "rss"),
        citation("c2", "feed-claude-limits", "reddit"),
      ],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:claude-reflect",
            label: "Claude Reflect",
            groupId: "group:claude-products",
          },
          {
            nodeId: "topic:story:claude-limits",
            label: "Claude Usage Limits",
            groupId: "group:claude-products",
          },
        ],
        groups: [
          {
            id: "group:claude-products",
            label: "Introducing Way Reflect",
          },
        ],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.groups[0]?.label).toBe("Claude Products");
  });

  it("uses evidence-backed topic phrases instead of short headline fragments", () => {
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:productivity-stack",
          representativeFeedItemId: "feed-productivity-stack",
          providerKeys: ["rss"],
        }),
        storyCluster({
          id: "story:anthropic-workshop",
          representativeFeedItemId: "feed-anthropic-workshop",
          providerKeys: ["hacker-news"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-productivity-stack",
          title: "The productivity stack many professionals rely on every day",
          providerKey: "rss",
        }),
        evidenceItem({
          feedItemId: "feed-anthropic-workshop",
          title: "Anthropic just showed a 24-minute workshop on AI security",
          providerKey: "hacker-news",
        }),
      ],
      topStories: [],
      citationMap: [
        citation("c1", "feed-productivity-stack", "rss"),
        citation("c2", "feed-anthropic-workshop", "hacker-news"),
      ],
      labelPlan: {
        nodeLabels: [
          {
            nodeId: "topic:story:productivity-stack",
            topicId: "topic:the",
            label: "The",
            groupId: "group:show",
          },
          {
            nodeId: "topic:story:anthropic-workshop",
            topicId: "topic:show",
            label: "Show",
            groupId: "group:show",
          },
        ],
        groups: [{ id: "group:show", label: "Show" }],
      },
      generatedBy: "agent-runtime",
    });

    expect(map.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(["Productivity Stack", "Anthropic AI Security"]),
    );
    expect(map.nodes.map((node) => node.label)).not.toEqual(
      expect.arrayContaining(["The", "Show"]),
    );
  });
});

const storyCluster = (
  overrides: Partial<StoryCluster> & Pick<StoryCluster, "id">,
): StoryCluster => ({
  storyKey: overrides.id,
  rankingPolicyVersion: "story_ranking_v4",
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
