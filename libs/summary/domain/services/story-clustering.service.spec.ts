import {
  tenantId,
  workspaceId,
  type Clock,
} from "@social-monitor/shared-kernel";

import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import { StoryClusteringService } from "./story-clustering.service";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

const clock: Clock = {
  now: () => new Date("2026-06-23T09:00:00.000Z"),
};

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  sourceBindingId: "binding-1",
  interestId: "interest-ai",
  providerKey: "reddit",
  canonicalUrl: "https://example.com/stories/ai-tooling?utm_source=reddit",
  title: "AI tooling launch",
  bodyPreview: "A new AI tooling library is trending.",
  publishedAt: new Date("2026-06-23T08:00:00.000Z"),
  observedAt: new Date("2026-06-23T08:05:00.000Z"),
  score: 1.5,
  whyImportant: ["Fresh item in the current monitoring window"],
  ...overrides,
});

describe("StoryClusteringService", () => {
  it("clusters the same canonical URL across interests and providers", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "feed-reddit",
          interestId: "interest-ai",
          providerKey: "reddit",
          score: 1.8,
        }),
        evidenceItem({
          feedItemId: "feed-github",
          sourceItemId: "source-2",
          interestId: "interest-github",
          providerKey: "github",
          canonicalUrl: "https://example.com/stories/ai-tooling#discussion",
          score: 2.2,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.rankingPolicyVersion).toBe(
      STORY_RANKING_POLICY_V1.version,
    );
    expect(selection.clusters[0]).toMatchObject({
      rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
      representativeFeedItemId: "feed-github",
      duplicateFeedItemIds: ["feed-reddit"],
      interestIds: ["interest-ai", "interest-github"],
      providerKeys: ["github", "reddit"],
      signalBreakdown: {
        baseScore: 2.2,
        crossProviderSupport: 0.3,
        sameProviderSupport: 0,
        providerDiversityBoost: 0.25,
        interestDiversityBoost: 0.12,
        freshnessBoost: 0.18,
        totalScore: 3.05,
      },
    });
    expect(selection.clusters[0]?.score).toBe(3.05);
    expect(selection.clusters[0]?.whyImportant).toContain(
      "Confirmed by 2 source groups: github, reddit",
    );
    expect(selection.sourceWindow.selectedFeedItemIds).toEqual([
      "feed-github",
      "feed-reddit",
    ]);
  });

  it("caps same-provider duplicate support below cross-provider confirmation", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "feed-reddit-main",
          canonicalUrl: "https://example.com/stories/main",
          providerKey: "reddit",
          score: 2,
        }),
        evidenceItem({
          feedItemId: "feed-reddit-duplicate",
          canonicalUrl: "https://example.com/stories/main",
          providerKey: "reddit",
          score: 1.9,
        }),
        evidenceItem({
          feedItemId: "feed-hn-main",
          canonicalUrl: "https://example.com/stories/cross-source",
          providerKey: "hacker-news",
          score: 1.8,
        }),
        evidenceItem({
          feedItemId: "feed-reddit-cross",
          canonicalUrl: "https://example.com/stories/cross-source",
          providerKey: "reddit",
          score: 1.7,
        }),
      ],
    });

    const crossProvider = selection.clusters.find(
      (cluster) => cluster.storyKey === "url:example.com/stories/cross-source",
    );
    const sameProvider = selection.clusters.find(
      (cluster) => cluster.storyKey === "url:example.com/stories/main",
    );

    expect(crossProvider?.score).toBeGreaterThan(sameProvider?.score ?? 0);
    expect(sameProvider?.whyImportant).toContain(
      "Clustered 2 related source items",
    );
    expect(sameProvider?.signalBreakdown).toEqual(
      expect.objectContaining({
        crossProviderSupport: 0,
        sameProviderSupport: expect.any(Number),
      }),
    );
  });

  it("does not merge different canonical URLs from title-only story hints", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "feed-model-release",
          sourceItemId: "reddit-release",
          canonicalUrl: "https://example.com/openai-codex-release",
          title: "OpenAI Codex launches developer agents",
          storyKeyHint: "title:openai-codex-launches-developer-agents",
          score: 2.1,
        }),
        evidenceItem({
          feedItemId: "feed-security-issue",
          sourceItemId: "reddit-security",
          providerKey: "hacker-news",
          canonicalUrl: "https://example.com/openai-codex-security-issue",
          title: "OpenAI Codex launches developer agents",
          storyKeyHint: "title:openai-codex-launches-developer-agents",
          score: 2,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(2);
    expect(
      selection.clusters.map((cluster) => cluster.storyKey).sort(),
    ).toEqual([
      "url:example.com/openai-codex-release",
      "url:example.com/openai-codex-security-issue",
    ]);
    expect(
      selection.clusters.flatMap((cluster) => cluster.duplicateFeedItemIds),
    ).toEqual([]);
  });

  it("clusters cross-provider stories by shared product and topic tokens", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "reddit-claude-code",
          sourceItemId: "reddit-claude-code",
          providerKey: "reddit",
          canonicalUrl:
            "https://www.reddit.com/r/ClaudeAI/comments/abc/claude_code_cache_security",
          title: "Claude Code session cache security concern gets traction",
          bodyPreview:
            "Developers discuss Claude Code cache leakage and security impact.",
          score: 2.1,
        }),
        evidenceItem({
          feedItemId: "x-claude-code",
          sourceItemId: "x-claude-code",
          providerKey: "x-twitter",
          canonicalUrl: "https://x.com/example/status/123",
          title: "Claude Code security chatter focuses on session cache leak",
          bodyPreview:
            "Builders mention Claude Code session cache risk and mitigation steps.",
          score: 1.9,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      representativeFeedItemId: "reddit-claude-code",
      duplicateFeedItemIds: ["x-claude-code"],
      providerKeys: ["reddit", "x-twitter"],
    });
    expect(selection.clusters[0]?.whyImportant).toContain(
      "Confirmed by 2 source groups: reddit, x-twitter",
    );
  });

  it("keeps technical selection notes out of story cluster reasons", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          whyImportant: [
            "Selected to preserve provider coverage in the reader summary window",
            "Unsafe source instructions were sandboxed before summarization",
            "Strong source engagement signal",
          ],
        }),
      ],
    });

    expect(selection.clusters[0]?.whyImportant).toEqual(
      expect.arrayContaining(["Strong source engagement signal"]),
    );
    expect(selection.clusters[0]?.whyImportant).not.toEqual(
      expect.arrayContaining([
        "Selected to preserve provider coverage in the reader summary window",
        "Unsafe source instructions were sandboxed before summarization",
      ]),
    );
  });

  it("uses stronger native engagement as the representative when story scores are close", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "rss-token-pricing",
          sourceItemId: "rss-token-pricing",
          providerKey: "rss",
          canonicalUrl: "https://example.com/stories/token-pricing",
          title: "Token pricing analysis",
          bodyPreview:
            "RSS mirrors the token pricing story with limited engagement context.",
          score: 2.32,
          observedAt: new Date("2026-06-23T08:20:00.000Z"),
        }),
        evidenceItem({
          feedItemId: "hn-token-pricing",
          sourceItemId: "hn-token-pricing",
          providerKey: "hacker-news",
          canonicalUrl: "https://example.com/stories/token-pricing",
          title: "Price per 1M tokens is meaningless",
          bodyPreview:
            "HN discussion adds points and comments to the token pricing story.",
          score: 2.2,
          observedAt: new Date("2026-06-23T08:10:00.000Z"),
          providerMetricLabels: [
            { label: "Points", value: "420" },
            { label: "Comments", value: "87" },
          ],
          providerMetricSummary: "420 points, 87 comments",
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      representativeFeedItemId: "hn-token-pricing",
      duplicateFeedItemIds: ["rss-token-pricing"],
      signalBreakdown: {
        baseScore: 2.32,
      },
    });
    expect(selection.sourceWindow.selectedFeedItemIds).toEqual([
      "hn-token-pricing",
      "rss-token-pricing",
    ]);
  });

  it("keeps a clearly stronger story score ahead of viral duplicate metrics", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "rss-model-release",
          sourceItemId: "rss-model-release",
          providerKey: "rss",
          canonicalUrl: "https://example.com/stories/model-release",
          title: "Model release technical details",
          bodyPreview: "RSS article captures the concrete model release.",
          score: 2.4,
        }),
        evidenceItem({
          feedItemId: "x-model-release",
          sourceItemId: "x-model-release",
          providerKey: "x-twitter",
          canonicalUrl: "https://example.com/stories/model-release",
          title: "Hot take on the model release",
          bodyPreview:
            "Social post mentions the model release with broad engagement.",
          score: 1.9,
          providerMetricLabels: [
            { label: "Likes", value: "12,400" },
            { label: "Reposts", value: "2,100" },
            { label: "Replies", value: "460" },
          ],
          providerMetricSummary: "12,400 likes, 2,100 reposts, 460 replies",
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      representativeFeedItemId: "rss-model-release",
      duplicateFeedItemIds: ["x-model-release"],
      signalBreakdown: {
        baseScore: 2.4,
      },
    });
  });

  it("does not treat percentage ratios as representative engagement counts", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "rss-upvote-context",
          sourceItemId: "rss-upvote-context",
          providerKey: "rss",
          canonicalUrl: "https://example.com/stories/upvote-context",
          title: "Upvote context writeup",
          score: 2.25,
        }),
        evidenceItem({
          feedItemId: "reddit-upvote-context",
          sourceItemId: "reddit-upvote-context",
          providerKey: "reddit",
          canonicalUrl: "https://example.com/stories/upvote-context",
          title: "Upvote context discussion",
          score: 2.2,
          providerMetricLabels: [{ label: "Upvote ratio", value: "91%" }],
          providerMetricSummary: "91% upvoted",
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      representativeFeedItemId: "rss-upvote-context",
      duplicateFeedItemIds: ["reddit-upvote-context"],
    });
  });

  it("does not fuzzy-merge generic AI agent stories without enough shared topic tokens", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "reddit-agent-memory",
          sourceItemId: "reddit-agent-memory",
          providerKey: "reddit",
          canonicalUrl:
            "https://www.reddit.com/r/LocalLLaMA/comments/agent_memory",
          title: "AI agents need better long-term memory",
          bodyPreview: "Discussion about memory design for coding workflows.",
          score: 1.8,
        }),
        evidenceItem({
          feedItemId: "x-agent-pricing",
          sourceItemId: "x-agent-pricing",
          providerKey: "x-twitter",
          canonicalUrl: "https://x.com/example/status/agent-pricing",
          title: "AI agent pricing complaints keep spreading",
          bodyPreview: "Builders complain about usage caps and pricing.",
          score: 1.7,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(2);
  });

  it("uses a GitHub repository as the canonical entity across discussion sources", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "feed-repo",
          providerKey: "github-repo-radar",
          canonicalUrl: "https://github.com/OpenAI/Codex?utm_source=radar",
          title: "openai/codex",
          score: 2.2,
          storyKeyHint: "url:github.com/openai/codex?source=old",
        }),
        evidenceItem({
          feedItemId: "feed-reddit",
          sourceItemId: "reddit-1",
          providerKey: "reddit",
          canonicalUrl:
            "https://www.reddit.com/r/programming/comments/1/why_openai_codex_matters",
          title: "Why openai/codex is suddenly everywhere",
          score: 1.7,
          storyKeyHint: "reddit:discussion-1",
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      storyKey: "github-repo:openai/codex",
      representativeFeedItemId: "feed-repo",
      duplicateFeedItemIds: ["feed-reddit"],
      providerKeys: ["github-repo-radar", "reddit"],
    });
  });

  it("clusters GitHub repository URL aliases and cross-provider discussion text", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "feed-github",
          providerKey: "github-repo-radar",
          canonicalUrl:
            "https://www.github.com/OpenAI/Codex.git?utm_source=radar",
          title: "OpenAI Codex repository",
          score: 2.3,
        }),
        evidenceItem({
          feedItemId: "feed-hn",
          sourceItemId: "hn-123",
          providerKey: "hacker-news",
          canonicalUrl:
            "https://news.ycombinator.com/item?id=123&utm_source=hn",
          title: "Launch discussion",
          bodyPreview:
            "HN is discussing https://github.com/openai/codex/issues/42.",
          score: 1.8,
        }),
        evidenceItem({
          feedItemId: "feed-reddit",
          sourceItemId: "reddit-abc",
          providerKey: "reddit",
          canonicalUrl:
            "https://m.reddit.com/r/programming/comments/abc/openai_codex?utm_source=share",
          title: "Why openai/codex matters for agents",
          bodyPreview:
            "Reddit comments compare openai/codex with other repositories.",
          score: 1.6,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      storyKey: "github-repo:openai/codex",
      representativeFeedItemId: "feed-github",
      duplicateFeedItemIds: ["feed-hn", "feed-reddit"],
      providerKeys: ["github-repo-radar", "hacker-news", "reddit"],
    });
  });

  it("unwraps known redirect wrappers without live network access", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "feed-google-redirect",
          providerKey: "hacker-news",
          canonicalUrl:
            "https://www.google.com/url?q=https%3A%2F%2Fgithub.com%2FOpenAI%2FCodex%3Futm_source%3Dredirect",
          title: "HN discusses openai/codex",
          score: 1.8,
        }),
        evidenceItem({
          feedItemId: "feed-facebook-redirect",
          sourceItemId: "facebook-redirect",
          providerKey: "reddit",
          canonicalUrl:
            "https://l.facebook.com/l.php?u=https%3A%2F%2Fgithub.com%2Fopenai%2Fcodex",
          title: "Reddit discusses openai/codex",
          score: 1.6,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      storyKey: "github-repo:openai/codex",
      duplicateFeedItemIds: ["feed-facebook-redirect"],
    });
  });

  it("rejects unsafe redirect targets when building story keys", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "feed-localhost-redirect",
          canonicalUrl:
            "https://www.google.com/url?q=http%3A%2F%2F127.0.0.1%2Fadmin",
          title: "Unsafe redirect target",
          score: 1.2,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]?.storyKey).toBe("url:google.com/url");
  });

  it("normalizes HN item links and X/Twitter aliases without provider-specific raw scores", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "hn-original",
          providerKey: "hacker-news",
          canonicalUrl:
            "https://news.ycombinator.com/item?id=987&utm_source=frontpage",
          title: "HN item",
          score: 1.1,
        }),
        evidenceItem({
          feedItemId: "hn-alias",
          sourceItemId: "hn-987-alias",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=987&p=2",
          title: "HN item page 2",
          score: 1,
        }),
        evidenceItem({
          feedItemId: "x-original",
          sourceItemId: "x-123",
          providerKey: "x",
          canonicalUrl: "https://twitter.com/OpenAI/status/12345?ref=share",
          title: "OpenAI status",
          score: 1.3,
        }),
        evidenceItem({
          feedItemId: "x-alias",
          sourceItemId: "x-123-alias",
          providerKey: "x",
          canonicalUrl: "https://x.com/openai/status/12345",
          title: "OpenAI status mirror",
          score: 1.2,
        }),
      ],
    });

    expect(
      selection.clusters.map((cluster) => cluster.storyKey).sort(),
    ).toEqual([
      "url:news.ycombinator.com/item/987",
      "url:x.com/openai/status/12345",
    ]);
    expect(
      selection.clusters.map((cluster) => cluster.duplicateFeedItemIds),
    ).toEqual([["x-alias"], ["hn-alias"]]);
  });

  it("keeps cross-provider evidence before same-provider duplicates inside the selected window", () => {
    const service = new StoryClusteringService(clock, {
      ...STORY_RANKING_POLICY_V1,
      maxSelectedEvidencePerCluster: 3,
    });

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: "github-repo-main",
          providerKey: "github-repo-radar",
          canonicalUrl: "https://github.com/openai/codex",
          title: "openai/codex",
          score: 3,
        }),
        evidenceItem({
          feedItemId: "github-repo-duplicate-1",
          sourceItemId: "github-duplicate-1",
          providerKey: "github-repo-radar",
          canonicalUrl: "https://github.com/openai/codex?ref=radar",
          title: "openai/codex",
          score: 2.9,
        }),
        evidenceItem({
          feedItemId: "github-repo-duplicate-2",
          sourceItemId: "github-duplicate-2",
          providerKey: "github-repo-radar",
          canonicalUrl: "https://github.com/openai/codex/stargazers",
          title: "openai/codex stargazers",
          score: 2.8,
        }),
        evidenceItem({
          feedItemId: "reddit-discussion",
          sourceItemId: "reddit-discussion",
          providerKey: "reddit",
          canonicalUrl:
            "https://www.reddit.com/r/programming/comments/codex/openai_codex_discussion",
          title: "Reddit discusses openai/codex",
          bodyPreview: "Developers compare openai/codex adoption velocity.",
          score: 1.1,
        }),
        evidenceItem({
          feedItemId: "hn-discussion",
          sourceItemId: "hn-discussion",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=123",
          title: "HN discusses openai/codex",
          bodyPreview:
            "Comments link to https://github.com/openai/codex and discuss the launch.",
          score: 1,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      storyKey: "github-repo:openai/codex",
      providerKeys: ["github-repo-radar", "hacker-news", "reddit"],
    });
    expect(selection.sourceWindow.selectedFeedItemIds).toEqual([
      "github-repo-main",
      "reddit-discussion",
      "hn-discussion",
    ]);
  });

  it("returns a deterministic empty source window for no evidence", () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scope: { type: "workspace" },
      },
      limit: 10,
      items: [],
    });

    expect(selection.sourceWindow).toMatchObject({
      selectedFeedItemIds: [],
      storyClusterIds: [],
    });
    expect(selection.sourceWindow.endedAt.getTime()).toBeGreaterThan(
      selection.sourceWindow.startedAt.getTime(),
    );
  });
});
