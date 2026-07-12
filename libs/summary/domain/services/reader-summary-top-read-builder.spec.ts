import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  evidenceClusterMap,
  storyToTopRead,
} from "./reader-summary-top-read-builder";

describe("reader summary top read builder", () => {
  it("keeps cross-source support out of the top read title and reason", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:claude-code-tracker",
      title:
        "Anthropic Claude Code tracker story gets cross-provider attention",
      summary: "Confirmed by 2 source groups: hacker-news, rss",
      interestIds: ["ai-agents"],
      providerKeys: ["hacker-news", "rss"],
      citationIds: ["citation-hn", "citation-rss"],
    };
    const cluster: StoryCluster = {
      id: "story:claude-code-tracker",
      storyKey: "url:example.com/claude-code-tracker",
      representativeFeedItemId: "feed-hn",
      duplicateFeedItemIds: ["feed-rss"],
      interestIds: ["ai-agents"],
      providerKeys: ["hacker-news", "rss"],
      score: 2.69,
      observedAtRange: {
        startedAt: new Date("2026-07-06T09:00:00.000Z"),
        endedAt: new Date("2026-07-06T10:00:00.000Z"),
      },
      whyImportant: [
        "Confirmed by 2 source groups: hacker-news, rss",
        "Clustered 2 related source items",
        "Story signal score 2.69",
      ],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-hn",
        sourceItemId: "source-hn",
        providerKey: "hacker-news",
        providerName: "Hacker News",
        title: "Claude Code tracker raises telemetry questions",
        bodyPreview:
          "Developers are debating what Claude Code usage tracking means.",
        whyImportant: [
          "The post explains why Claude Code tracking concerns matter for developer teams.",
        ],
      }),
      evidenceItem({
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
        providerName: "RSS",
        title: "Anthropic Claude Code tracker details",
        whyImportant: [
          "RSS coverage adds the original tracker context and affected workflow details.",
        ],
      }),
    ];
    const citations: readonly ReaderSummaryCitation[] = [
      citation({
        citationId: "citation-hn",
        feedItemId: "feed-hn",
        sourceItemId: "source-hn",
        providerKey: "hacker-news",
      }),
      citation({
        citationId: "citation-rss",
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );
    const clusterById = new Map([[cluster.id, cluster] as const]);
    const evidenceByClusterId = evidenceClusterMap(
      [cluster],
      evidenceByFeedItemId,
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      evidenceByClusterId,
    );

    expect(topRead.title).toBe(
      "Claude Code tracker raises telemetry questions",
    );
    expect(topRead.reason).toBe(
      "The post explains why Claude Code tracking concerns matter for developer teams.",
    );
    expect(topRead.whyImportant.join(" ")).not.toContain("Confirmed by");
    expect(topRead.whyImportant.join(" ")).not.toContain("cross-provider");
    expect(topRead.confirmedProviderKeys).toEqual(["hacker-news"]);
    expect(topRead.confidence).toEqual(
      expect.objectContaining({ level: "low", score: 0.42 }),
    );
    expect(topRead.whyNow).toBe(
      "Current summary window has Hacker News coverage.",
    );
  });

  it("prefers the model-written story description over shorter evidence labels", () => {
    const modelDescription =
      "OpenAI introduced a work agent that can continue multi-step projects across connected apps and files. The release matters because it moves Codex-style automation beyond isolated coding tasks into longer operational workflows. Teams may be able to hand off research, document work and follow-up actions without rebuilding context for every step. Access scope and real-world reliability still need to be evaluated before the product is trusted with sensitive work.";
    const story: TopReadCandidate = {
      storyClusterId: "story:work-agent",
      title: "OpenAI introduces a Codex-powered work agent",
      summary: modelDescription,
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-work-agent"],
    };
    const evidence = evidenceItem({
      feedItemId: "feed-work-agent",
      providerKey: "x-twitter",
      providerName: "X/Twitter",
      title: "OpenAI introduces a Codex-powered work agent",
      whyImportant: ["First-party product announcement"],
    });
    const evidenceCitation = citation({
      citationId: "citation-work-agent",
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      providerKey: evidence.providerKey,
    });

    const topRead = storyToTopRead(
      story,
      new Map([[evidenceCitation.citationId, evidenceCitation]]),
      new Map([[evidence.feedItemId, evidence]]),
      new Map(),
      new Map(),
    );

    expect(topRead.reason).toBe(modelDescription);
    expect(topRead.whyImportant[0]).toBe(modelDescription);
  });

  it("keeps a native Reddit title with its exact model variant", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:sol-ultra-limit",
      title: "Users report GPT-5.6 consuming usage limits quickly",
      summary:
        "A Reddit user says their GPT-5.6 session consumed most of a usage limit in about 15 minutes. The report is anecdotal but relevant to early adoption.",
      interestIds: ["ai-agents"],
      providerKeys: ["reddit"],
      citationIds: ["citation-sol-ultra"],
    };
    const evidence = evidenceItem({
      feedItemId: "feed-sol-ultra",
      providerKey: "reddit",
      providerName: "Reddit",
      title: "Sol 5 Ultra burned through the 5-hour limit in 15 minutes.",
    });
    const evidenceCitation = citation({
      citationId: "citation-sol-ultra",
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      providerKey: evidence.providerKey,
    });

    const topRead = storyToTopRead(
      story,
      new Map([[evidenceCitation.citationId, evidenceCitation]]),
      new Map([[evidence.feedItemId, evidence]]),
      new Map(),
      new Map(),
    );

    expect(topRead.title).toBe(
      "Sol 5 Ultra burned through the 5-hour limit in 15 minutes.",
    );
  });

  it("removes source-coverage sentences without discarding the useful model description", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:work-agent-coverage",
      title: "OpenAI introduces a Codex-powered work agent",
      summary:
        "OpenAI introduced a work agent that can continue multi-step projects across connected apps and files. The story has the strongest cross-provider support in the selected evidence. Teams may be able to delegate research and follow-up actions without rebuilding context for every step. Access scope and real-world reliability still need careful evaluation.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-work-agent-coverage"],
    };
    const evidence = evidenceItem({
      feedItemId: "feed-work-agent-coverage",
      providerKey: "x-twitter",
      providerName: "X/Twitter",
      title: story.title,
      whyImportant: ["First-party product announcement"],
    });
    const evidenceCitation = citation({
      citationId: "citation-work-agent-coverage",
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      providerKey: evidence.providerKey,
    });

    const topRead = storyToTopRead(
      story,
      new Map([[evidenceCitation.citationId, evidenceCitation]]),
      new Map([[evidence.feedItemId, evidence]]),
      new Map(),
      new Map(),
    );

    expect(topRead.reason).toBe(
      "OpenAI introduced a work agent that can continue multi-step projects across connected apps and files. Teams may be able to delegate research and follow-up actions without rebuilding context for every step. Access scope and real-world reliability still need careful evaluation.",
    );
    expect(topRead.reason).not.toContain("cross-provider");
  });

  it("renders Hacker News RSS mirrors as Hacker News without false cross-source support", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:hnrss-vibe-coding",
      title: "TypeScript Go rewrite drew HN and RSS attention",
      summary:
        "HN discussion asks whether OSS maintainers accept AI-written PRs.",
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      citationIds: ["citation-hnrss"],
    };
    const cluster: StoryCluster = {
      id: "story:hnrss-vibe-coding",
      storyKey: "url:news.ycombinator.com/item",
      representativeFeedItemId: "feed-hnrss",
      duplicateFeedItemIds: [],
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      score: 2.28,
      observedAtRange: {
        startedAt: new Date("2026-07-07T10:53:20.000Z"),
        endedAt: new Date("2026-07-07T10:53:21.000Z"),
      },
      whyImportant: [
        "Developers are debating whether OSS projects should accept AI-written PRs.",
      ],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-hnrss",
        sourceItemId: "source-hnrss",
        providerKey: "rss",
        providerName: "Hacker News via RSS",
        canonicalUrl: "https://news.ycombinator.com/item?id=48816039",
        title: "Ask HN: Are OSS projects allowing vibe-coding?",
        whyImportant: [
          "Developers are debating whether OSS projects should accept AI-written PRs.",
        ],
      }),
    ];
    const citations: readonly ReaderSummaryCitation[] = [
      citation({
        citationId: "citation-hnrss",
        feedItemId: "feed-hnrss",
        sourceItemId: "source-hnrss",
        providerKey: "rss",
        canonicalUrl: "https://news.ycombinator.com/item?id=48816039",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );
    const clusterById = new Map([[cluster.id, cluster] as const]);
    const evidenceByClusterId = evidenceClusterMap(
      [cluster],
      evidenceByFeedItemId,
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      evidenceByClusterId,
    );

    expect(topRead.providerKey).toBe("hacker-news");
    expect(topRead.providerName).toBe("Hacker News via RSS");
    expect(topRead.title).toBe(
      "Ask HN: Are OSS projects allowing vibe-coding?",
    );
    expect(topRead.confirmedProviderKeys).toEqual(["hacker-news"]);
    expect(topRead.confidence.rationale).toContain(
      "not been independently confirmed",
    );
    expect(topRead.whyNow).toBe(
      "Current summary window has Hacker News via RSS coverage.",
    );
  });

  it("does not expose cross-source support without a visible eligible citation", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:anthropic-tracker",
      title: "Anthropic tracker report gets multi-source attention",
      summary: "RSS article and HN discussion are linked by the story cluster.",
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      citationIds: ["citation-rss"],
    };
    const cluster: StoryCluster = {
      id: "story:anthropic-tracker",
      storyKey: "url:example.com/anthropic-tracker",
      representativeFeedItemId: "feed-hn",
      duplicateFeedItemIds: ["feed-rss"],
      interestIds: ["ai-agents"],
      providerKeys: ["hacker-news", "rss"],
      score: 2.55,
      signalBreakdown: {
        baseScore: 2,
        crossProviderSupport: 0.24,
        sameProviderSupport: 0,
        providerDiversityBoost: 0.25,
        interestDiversityBoost: 0,
        freshnessBoost: 0.06,
        totalScore: 2.55,
      },
      observedAtRange: {
        startedAt: new Date("2026-07-06T17:00:00.000Z"),
        endedAt: new Date("2026-07-06T17:45:00.000Z"),
      },
      whyImportant: [
        "Confirmed by 2 source groups: hacker-news, rss",
        "Clustered 2 related source items",
      ],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-hn",
        providerKey: "hacker-news",
        providerName: "Hacker News",
        title: "HN discusses the Anthropic tracker report",
        contentQuality: {
          qualityScore: 0.8,
          interestRelevanceScore: 0.8,
          engagementIntegrityScore: 0.8,
          eligibleForSummary: true,
          eligibleForTopRead: false,
          needsLlmReview: false,
          decision: "downrank",
          flags: ["weak_topic_match"],
          reason: "not representative enough for top reads",
        },
      }),
      evidenceItem({
        feedItemId: "feed-rss",
        providerKey: "rss",
        providerName: "RSS",
        title: "Anthropic hid a tracker in Claude Code",
        whyImportant: [
          "The article describes the reported Claude Code tracker.",
        ],
      }),
    ];
    const citations: readonly ReaderSummaryCitation[] = [
      citation({
        citationId: "citation-rss",
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );
    const clusterById = new Map([[cluster.id, cluster] as const]);
    const evidenceByClusterId = evidenceClusterMap(
      [cluster],
      evidenceByFeedItemId,
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      evidenceByClusterId,
    );

    expect(topRead.citationIds).toEqual(["citation-rss"]);
    expect(topRead.confirmedProviderKeys).toEqual(["rss"]);
    expect(topRead.confidence.level).toBe("low");
    expect(topRead.confidence.score).toBe(0.42);
    expect(topRead.whyNow).toBe("Current summary window has RSS coverage.");
  });

  it("rejects model citations that do not belong to the deterministic story cluster", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:benchmark",
      title: "Artificial Analysis benchmark update",
      summary:
        "Artificial Analysis and an unrelated Reddit post jointly confirm a model benchmark update.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter", "reddit"],
      citationIds: ["citation-x", "citation-unrelated-reddit"],
    };
    const benchmark = evidenceItem({
      feedItemId: "feed-x-benchmark",
      providerKey: "x-twitter",
      title: "Artificial Analysis compares GPT-5.6 and Claude",
      bodyPreview:
        "Artificial Analysis published a benchmark comparing GPT-5.6 and Claude. The result remains benchmark-specific.",
    });
    const unrelated = evidenceItem({
      feedItemId: "feed-reddit-bun",
      providerKey: "reddit",
      title: "Bun was rewritten from Zig to Rust",
    });
    const cluster: StoryCluster = {
      id: story.storyClusterId,
      storyKey: "url:x.com/artificial-analysis",
      representativeFeedItemId: benchmark.feedItemId,
      duplicateFeedItemIds: [],
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      score: 2.2,
      observedAtRange: {
        startedAt: benchmark.observedAt,
        endedAt: new Date(benchmark.observedAt.getTime() + 1),
      },
      whyImportant: [],
    };
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: benchmark.feedItemId,
        sourceItemId: benchmark.sourceItemId,
        providerKey: benchmark.providerKey,
      }),
      citation({
        citationId: "citation-unrelated-reddit",
        feedItemId: unrelated.feedItemId,
        sourceItemId: unrelated.sourceItemId,
        providerKey: unrelated.providerKey,
      }),
    ];
    const evidence = [benchmark, unrelated];

    const topRead = storyToTopRead(
      story,
      new Map(citations.map((item) => [item.citationId, item] as const)),
      new Map(evidence.map((item) => [item.feedItemId, item] as const)),
      new Map([[cluster.id, cluster]]),
      evidenceClusterMap(
        [cluster],
        new Map(evidence.map((item) => [item.feedItemId, item] as const)),
      ),
    );

    expect(topRead.citationIds).toEqual(["citation-x"]);
    expect(topRead.confirmedProviderKeys).toEqual(["x-twitter"]);
    expect(topRead.reason).not.toContain("unrelated Reddit post");
  });

  it("rejects reason text that names a provider without visible evidence", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:token-efficiency",
      title: "GPT-5.6 token efficiency claim",
      summary:
        "A Reddit post and a Hacker News item both carried the claim that GPT-5.6 is 54% more token efficient on agentic coding. The claim may affect operating cost, but the benchmark method is not described in the excerpt.",
      interestIds: ["ai-agents"],
      providerKeys: ["reddit"],
      citationIds: ["citation-reddit"],
    };
    const reddit = evidenceItem({
      feedItemId: "feed-reddit-efficiency",
      providerKey: "reddit",
      title: "GPT-5.6 is 54% more token efficient on agentic coding",
      bodyPreview:
        "A Reddit discussion cites a 54% token-efficiency claim for agentic coding. The excerpt does not describe the benchmark method.",
      whyImportant: [],
    });
    const cluster: StoryCluster = {
      id: story.storyClusterId,
      storyKey: "url:reddit.com/token-efficiency",
      representativeFeedItemId: reddit.feedItemId,
      duplicateFeedItemIds: [],
      interestIds: story.interestIds,
      providerKeys: ["reddit"],
      score: 2.1,
      observedAtRange: {
        startedAt: reddit.observedAt,
        endedAt: new Date(reddit.observedAt.getTime() + 1),
      },
      whyImportant: [],
    };
    const evidenceCitation = citation({
      citationId: "citation-reddit",
      feedItemId: reddit.feedItemId,
      sourceItemId: reddit.sourceItemId,
      providerKey: reddit.providerKey,
    });

    const topRead = storyToTopRead(
      story,
      new Map([[evidenceCitation.citationId, evidenceCitation]]),
      new Map([[reddit.feedItemId, reddit]]),
      new Map([[cluster.id, cluster]]),
      evidenceClusterMap([cluster], new Map([[reddit.feedItemId, reddit]])),
    );

    expect(topRead.confirmedProviderKeys).toEqual(["reddit"]);
    expect(topRead.reason).not.toContain("Hacker News");
    expect(topRead.reason).toContain("Reddit");
  });

  it("skips teaser sentences when a truncated X post has a useful title", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:codex-work",
      title: "Check this out",
      summary: "First-party product announcement.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = evidenceItem({
      feedItemId: "feed-x-work",
      providerKey: "x-twitter",
      title:
        "X post by @sama: check this out! you can get some amazing things done. codex is the core of our new work produ...",
      bodyPreview:
        "check this out! you can get some amazing things done. codex is the core of our new work product and what makes it so good. codex is not going anywhere.",
    });
    const evidenceCitation = citation({
      citationId: "citation-x",
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      providerKey: evidence.providerKey,
    });

    const topRead = storyToTopRead(
      story,
      new Map([[evidenceCitation.citationId, evidenceCitation]]),
      new Map([[evidence.feedItemId, evidence]]),
      new Map(),
      new Map(),
    );

    expect(topRead.title).toBe(
      "Codex is the core of our new work product and what makes it so good",
    );
  });

  it("keeps internal provider-coverage fallback text out of the reason", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:rss-coverage",
      title: "Strong source engagement signal",
      summary: "Source-reported: RSS explains an AI agent security update.",
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      citationIds: ["citation-rss"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-rss",
        providerKey: "rss",
        providerName: "RSS",
        title: "RSS explains an AI agent security update",
        bodyPreview:
          "The update records how connected MCP servers access files, networks and local tools. Teams can use the audit data before granting production permissions.",
        whyImportant: [
          "Selected to preserve provider coverage in the reader summary window",
          "Appears across 2 monitored interests",
          "Unsafe source instructions were sandboxed before summarization",
        ],
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-rss",
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.reason).toBe(
      "The report states: The update records how connected MCP servers access files, networks and local tools.",
    );
    expect(topRead.title).toBe("RSS explains an AI agent security update");
    expect(topRead.reason).not.toContain(topRead.title);
    expect(topRead.reason).not.toContain("source-reported");
  });

  it("removes provider boilerplate from X top read titles", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:gpt-live",
      title: "X post by @OpenAI: GPT-Live voice models roll out in ChatGPT",
      summary: "OpenAI describes GPT-Live voice model rollout.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-x",
        providerKey: "x-twitter",
        providerName: "X/Twitter",
        title: "X post by @OpenAI: GPT-Live makes voice interaction faster",
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: "feed-x",
        sourceItemId: "source-x",
        providerKey: "x-twitter",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.title).toBe("GPT-Live voice models roll out in ChatGPT");
  });

  it("labels an unverified breaking X hook without hiding its subject", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:unverified-gpt",
      title: "Strong source engagement signal",
      summary: "Source-reported: rollout chatter needs confirmation.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-x",
        providerKey: "x-twitter",
        providerName: "X/Twitter",
        title:
          "X post by @WatcherGuru: JUST IN: US government grants OpenAI approval to release GPT 5.6",
        providerMetricSummary: "4,829 likes, 379 reposts, 267 replies",
        whyImportant: ["Strong source engagement signal"],
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: "feed-x",
        sourceItemId: "source-x",
        providerKey: "x-twitter",
      }),
    ];

    const topRead = storyToTopRead(
      story,
      new Map(citations.map((item) => [item.citationId, item] as const)),
      new Map(evidence.map((item) => [item.feedItemId, item] as const)),
      new Map(),
      evidenceClusterMap([], new Map()),
    );

    expect(topRead.title).toBe(
      "Unverified report: US government grants OpenAI approval to release GPT 5.6",
    );
    expect(topRead.reason).toContain("should not be treated as confirmation");
  });

  it("uses a complete preview when an official X title is truncated", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:gpt-rollout",
      title: "Strong source engagement signal",
      summary: "Source-reported: rollout details.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = evidenceItem({
      feedItemId: "feed-x",
      providerKey: "x-twitter",
      providerName: "X/Twitter",
      authorHandle: "OpenAI",
      title:
        "X post by @OpenAI: Sol, Terra, and Luna, our GPT-5.6 family, are starting to roll out...",
      bodyPreview:
        "Sol, Terra, and Luna, our GPT-5.6 family, are starting to roll out now in ChatGPT, Codex, and the API. https://t.co/example",
      whyImportant: ["Strong source engagement signal"],
      contentQuality: {
        qualityScore: 1,
        interestRelevanceScore: 0.95,
        engagementIntegrityScore: 1,
        eligibleForSummary: true,
        eligibleForTopRead: true,
        needsLlmReview: false,
        decision: "promote",
        flags: ["official_account", "trusted_author"],
        reason: "First-party product announcement",
      },
    });
    const citationItem = citation({
      citationId: "citation-x",
      feedItemId: "feed-x",
      sourceItemId: "source-x",
      providerKey: "x-twitter",
    });

    const topRead = storyToTopRead(
      story,
      new Map([[citationItem.citationId, citationItem]]),
      new Map([[evidence.feedItemId, evidence]]),
      new Map(),
      new Map(),
    );

    expect(topRead.title).toBe(
      "Sol, Terra, and Luna, our GPT-5.6 family, are starting to roll out now in ChatGPT, Codex, and the API",
    );
    expect(topRead.reason).toBe(
      "OpenAI's first-party post provides direct evidence for this update: Sol, Terra, and Luna, our GPT-5.6 family, are starting to roll out now in ChatGPT, Codex, and the API.",
    );
  });

  it("normalizes a conversational X hook when the model copies it", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:fable-demo",
      title:
        "X post by @builder: what happens when Fable spends a full week of credits...",
      summary: "A high-engagement Fable workflow experiment.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-x",
        providerKey: "x-twitter",
        providerName: "X/Twitter",
        title: story.title,
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: "feed-x",
        sourceItemId: "source-x",
        providerKey: "x-twitter",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.title).toBe("A high-engagement Fable workflow experiment");
  });

  it("marks an eligible official first-party announcement as medium confidence", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:gpt-rollout",
      title: "OpenAI announces a GPT rollout",
      summary: "OpenAI published a first-party rollout announcement.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-x",
        providerKey: "x-twitter",
        providerName: "X/Twitter",
        authorHandle: "OpenAI",
        contentQuality: {
          qualityScore: 1,
          interestRelevanceScore: 0.9,
          engagementIntegrityScore: 1,
          eligibleForSummary: true,
          eligibleForTopRead: true,
          needsLlmReview: false,
          decision: "promote",
          flags: ["official_account", "trusted_author"],
          reason: "First-party product announcement",
        },
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: "feed-x",
        sourceItemId: "source-x",
        providerKey: "x-twitter",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.confidence.level).toBe("medium");
    expect(topRead.confidence.score).toBe(0.62);
    expect(topRead.confidence.rationale).toContain("first-party official");
    expect(topRead.confirmedProviderKeys).toEqual(["x-twitter"]);
  });

  it("omits empty optional engagement metrics from top reads", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:x-metrics",
      title: "OpenAI voice model post",
      summary: "OpenAI voice model post.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-x",
        providerKey: "x-twitter",
        providerName: "X/Twitter",
        providerMetricSummary: "1,006 likes, 69 reposts, 49 replies",
        providerMetricLabels: [
          { label: "Likes", value: "1,006" },
          { label: "Reposts", value: "69" },
          { label: "Replies", value: "49" },
          { label: "Quotes", value: "0" },
          { label: "Bookmarks", value: "0" },
          { label: "Impressions", value: "0" },
          { label: "Views", value: "-" },
        ],
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: "feed-x",
        sourceItemId: "source-x",
        providerKey: "x-twitter",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.providerMetrics).toEqual([
      {
        label: "X/Twitter evidence",
        value: "1,006 likes, 69 reposts, 49 replies",
      },
      { label: "Likes", value: "1,006" },
      { label: "Reposts", value: "69" },
      { label: "Replies", value: "49" },
    ]);
  });
});

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  sourceBindingId: "binding-ai",
  interestId: "ai-agents",
  providerKey: "hacker-news",
  providerName: "Hacker News",
  canonicalUrl: "https://example.com/claude-code-tracker",
  title: "Claude Code tracker",
  bodyPreview: "A source post discusses Claude Code tracking.",
  publishedAt: new Date("2026-07-06T09:00:00.000Z"),
  observedAt: new Date("2026-07-06T09:05:00.000Z"),
  score: 2.1,
  whyImportant: ["This item explains a concrete developer workflow concern."],
  ...overrides,
});

const citation = (params: {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly canonicalUrl?: string;
}): ReaderSummaryCitation => ({
  citationId: params.citationId,
  feedItemId: params.feedItemId,
  sourceItemId: params.sourceItemId,
  providerKey: params.providerKey,
  field: "title",
  canonicalUrl:
    params.canonicalUrl ?? "https://example.com/claude-code-tracker",
});
