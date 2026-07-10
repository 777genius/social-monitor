import { buildReaderSummaryTopicMap } from "./reader-summary-topic-map-builder";
import { evaluateTopicLabelQuality } from "./reader-summary-topic-map-label-quality";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCitation } from "../entities/citation";

describe("buildReaderSummaryTopicMap synthetic real-like day", () => {
  it("grounds weak LLM labels in sanitized multi-provider evidence", () => {
    const providerLabels = [
      "Hacker News",
      "Reddit",
      "RSS",
      "X Twitter",
      "GitHub Trending Page",
    ];
    const map = buildReaderSummaryTopicMap({
      clusters: [
        storyCluster({
          id: "story:claude-code-memory",
          score: 0.98,
          representativeFeedItemId: "feed-claude-cache",
          duplicateFeedItemIds: ["feed-claude-memory"],
          providerKeys: ["hacker-news", "reddit"],
        }),
        storyCluster({
          id: "story:eu-chat-control",
          score: 0.92,
          representativeFeedItemId: "feed-chat-control",
          providerKeys: ["rss"],
        }),
        storyCluster({
          id: "story:organic-maps-release",
          score: 0.74,
          representativeFeedItemId: "feed-organic-maps",
          providerKeys: ["github-trending-page"],
        }),
        storyCluster({
          id: "story:openai-realtime-voice",
          score: 0.66,
          representativeFeedItemId: "feed-openai-voice",
          providerKeys: ["hacker-news"],
        }),
        storyCluster({
          id: "story:secure-mcp-adoption",
          score: 0.58,
          representativeFeedItemId: "feed-secure-mcp",
          providerKeys: ["x-twitter"],
        }),
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-claude-cache",
          title: "Claude Code session cache improves local agent workflows",
          bodyPreview:
            "Developers compare Claude Code memory files and review automation.",
          providerKey: "hacker-news",
          providerName: "Hacker News",
        }),
        evidenceItem({
          feedItemId: "feed-claude-memory",
          title: "Claude Code memory file changes pull request review",
          bodyPreview:
            "Reddit discussion focuses on Claude Code memory and agent workflows.",
          providerKey: "reddit",
          providerName: "Reddit",
        }),
        evidenceItem({
          feedItemId: "feed-chat-control",
          title: "EU Chat Control fast-track raises encryption concerns",
          bodyPreview:
            "Policy watchers discuss the EU Chat Control council timeline.",
          providerKey: "rss",
          providerName: "RSS",
        }),
        evidenceItem({
          feedItemId: "feed-organic-maps",
          title: "Organic Maps offline navigation release improves privacy",
          bodyPreview:
            "The project release highlights offline routing and privacy maps.",
          providerKey: "github-trending-page",
          providerName: "GitHub Trending Page",
        }),
        evidenceItem({
          feedItemId: "feed-openai-voice",
          title: "OpenAI Realtime Voice API preview reaches developers",
          bodyPreview:
            "Hacker News comments discuss OpenAI realtime voice integration.",
          providerKey: "hacker-news",
          providerName: "Hacker News",
        }),
        evidenceItem({
          feedItemId: "feed-secure-mcp",
          title: "Secure MCP server adoption guide lands for agent sandboxes",
          bodyPreview:
            "The guide covers secure MCP server deployment for AI agents.",
          providerKey: "x-twitter",
          providerName: "X Twitter",
        }),
      ],
      topStories: [
        topStory("story:claude-code-memory", "Claude Code memory workflows"),
        topStory("story:eu-chat-control", "EU Chat Control fast-track"),
        topStory("story:organic-maps-release", "Organic Maps privacy release"),
        topStory("story:openai-realtime-voice", "OpenAI Realtime Voice API"),
        topStory("story:secure-mcp-adoption", "Secure MCP server adoption"),
      ],
      citationMap: [
        citation("c1", "feed-claude-cache", "hacker-news"),
        citation("c2", "feed-claude-memory", "reddit"),
        citation("c3", "feed-chat-control", "rss"),
        citation("c4", "feed-organic-maps", "github-trending-page"),
        citation("c5", "feed-openai-voice", "hacker-news"),
        citation("c6", "feed-secure-mcp", "x-twitter"),
      ],
      labelPlan: {
        nodeLabels: [
          llmLabel("story:claude-code-memory", "Claude", "group:claude", {
            topicId: "topic:claude",
          }),
          llmLabel("story:eu-chat-control", "The", "group:show", {
            topicId: "topic:the",
          }),
          llmLabel("story:organic-maps-release", "Show", "group:show", {
            topicId: "topic:show",
          }),
          llmLabel(
            "story:openai-realtime-voice",
            "Hacker News",
            "group:hacker-news",
            { topicId: "topic:hacker-news" },
          ),
          llmLabel("story:secure-mcp-adoption", "People", "group:people", {
            topicId: "topic:people",
          }),
        ],
        groups: [
          { id: "group:claude", label: "Claude" },
          { id: "group:show", label: "Show" },
          { id: "group:hacker-news", label: "Hacker News" },
          { id: "group:people", label: "People" },
        ],
      },
      generatedBy: "agent-runtime",
    });
    const nodeLabels = map.nodes.map((node) => node.label);
    const groupLabels = map.groups.map((group) => group.label);
    const weakLabels = ["Ask", "Breaking", "People", "Show", "The", "Why"];

    expect(nodeLabels).not.toEqual(expect.arrayContaining(weakLabels));
    expect(groupLabels).not.toEqual(
      expect.arrayContaining([...weakLabels, "Hacker News", "Topic Map"]),
    );
    expect(nodeLabels.some((label) => /Claude Code/u.test(label))).toBe(true);
    expect(nodeLabels).toEqual(expect.arrayContaining(["EU Chat Control"]));
    expect(nodeLabels).toEqual(
      expect.arrayContaining(["Organic Maps Privacy", "Secure MCP Server"]),
    );
    expect(
      nodeLabels.some((label) => /OpenAI Realtime Voice/u.test(label)),
    ).toBe(true);
    expect(nodeLabels).not.toContain("Claude");
    expect(
      map.nodes.find((node) => /OpenAI Realtime Voice/u.test(node.label))
        ?.groupId,
    ).not.toBe("group:hacker-news");
    expect(
      map.nodes.every(
        (node) =>
          evaluateTopicLabelQuality(node.label, { providerLabels }).accepted,
      ),
    ).toBe(true);
    expect(
      map.groups.every(
        (group) =>
          evaluateTopicLabelQuality(group.label, { providerLabels }).accepted,
      ),
    ).toBe(true);
  });
});

const storyCluster = (
  overrides: Partial<StoryCluster> & Pick<StoryCluster, "id">,
): StoryCluster => ({
  storyKey: overrides.id,
  rankingPolicyVersion: "story_ranking_v4",
  representativeFeedItemId: "feed-1",
  duplicateFeedItemIds: [],
  interestIds: ["ai-agents"],
  providerKeys: ["rss"],
  score: 0.5,
  observedAtRange: {
    startedAt: new Date("2026-07-05T00:00:00.000Z"),
    endedAt: new Date("2026-07-05T01:00:00.000Z"),
  },
  whyImportant: ["Synthetic ranking signal"],
  ...overrides,
});

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem> &
    Pick<SummaryEvidenceItem, "feedItemId" | "title" | "providerKey">,
): SummaryEvidenceItem => ({
  sourceItemId: overrides.feedItemId,
  sourceBindingId: "source-binding-synthetic",
  interestId: "ai-agents",
  canonicalUrl: `https://example.test/${overrides.feedItemId}`,
  bodyPreview: "Synthetic provider discussion.",
  publishedAt: new Date("2026-07-05T00:00:00.000Z"),
  observedAt: new Date("2026-07-05T00:10:00.000Z"),
  score: 0.7,
  whyImportant: ["Matches synthetic monitored interest"],
  ...overrides,
});

const topStory = (storyClusterId: string, title: string) => ({
  storyClusterId,
  title,
  summary: `${title} appears across sanitized provider evidence.`,
  interestIds: ["ai-agents"],
  providerKeys: ["rss"],
  citationIds: ["c1"],
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

const llmLabel = (
  storyClusterId: string,
  label: string,
  groupId: string,
  options: { readonly topicId?: string } = {},
) => ({
  nodeId: `topic:${storyClusterId}`,
  topicId: options.topicId,
  label,
  groupId,
  keywords: [label],
});
