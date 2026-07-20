import { buildReaderSummary } from "./reader-summary";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  SummaryEvidenceItem,
  StoryCluster,
} from "../value-objects/summary-evidence-item";

describe("buildReaderSummary", () => {
  it("neutralizes single-source model headlines so one title is not amplified as a confirmed claim", () => {
    const readerSummary = buildReaderSummary({
      headline:
        "OpenAI confirms GPT-5.6 benchmark leadership after preview launch",
      executiveSummary:
        "One Reddit source discussed a claimed GPT-5.6 preview benchmark.",
      topStories: [
        {
          storyClusterId: "cluster-1",
          title:
            "OpenAI ties Anthropic after alleged GPT-5.6 preview benchmark",
          summary:
            "A single Reddit post discussed an unverified GPT-5.6 benchmark claim.",
          interestIds: ["ai-models"],
          providerKeys: ["reddit"],
          citationIds: ["citation-1"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-1",
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          providerKey: "reddit",
          field: "title",
          canonicalUrl: "https://reddit.example/r/OpenAI/comments/1",
        },
      ],
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "reddit:openai-gpt-5-6",
          representativeFeedItemId: "feed-1",
          duplicateFeedItemIds: [],
          interestIds: ["ai-models"],
          providerKeys: ["reddit"],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
          },
          whyImportant: ["Single-source discussion needs confirmation."],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          sourceBindingId: "binding-reddit",
          interestId: "ai-models",
          providerKey: "reddit",
          providerName: "Reddit",
          canonicalUrl: "https://reddit.example/r/OpenAI/comments/1",
          title:
            "OpenAI ties Anthropic after alleged GPT-5.6 preview benchmark",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:00:00.000Z"),
          score: 2.4,
          whyImportant: ["Single-source discussion needs confirmation."],
        },
      ],
      qualityFlags: [],
    });

    expect(readerSummary.headline).toBe(
      "Single-source discussion needs confirmation",
    );
    expect(readerSummary.headline).not.toContain("GPT-5.6");
    expect(readerSummary.oneLineTakeaway).toBe(
      "Single-source discussion needs confirmation. Confirm important claims with another monitored source before acting.",
    );
    expect(readerSummary.oneLineTakeaway).not.toContain("GPT-5.6");
    expect(readerSummary.bullets[0]).toBe(
      "Best first cited read from Reddit (1 citation): OpenAI ties Anthropic after alleged GPT-5.6 preview benchmark - needs confirmation; verify citations in Top reads.",
    );
    expect(readerSummary.topReads[0]?.confidence).toEqual({
      level: "low",
      score: 0.42,
      rationale:
        "This story has not been independently confirmed across monitored source groups yet.",
    });
    expect(readerSummary.claimBoard[0]).toMatchObject({
      claim: "OpenAI ties Anthropic after alleged GPT-5.6 preview benchmark",
      evidence: [
        {
          providerKey: "reddit",
          citationId: "citation-1",
          canonicalUrl: "https://reddit.example/r/OpenAI/comments/1",
        },
      ],
      risks: [
        {
          kind: "single_source",
        },
        {
          kind: "low_confidence",
        },
      ],
      citationIds: ["citation-1"],
    });
  });

  it("carries representative preview media into top reads", () => {
    const readerSummary = buildReaderSummary({
      headline: "AI social pulse",
      executiveSummary: "One X/Twitter source includes a media preview.",
      topStories: [
        {
          storyClusterId: "cluster-x",
          title: "X post includes a launch image",
          summary: "A launch post includes a visual preview.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["x-twitter"],
          citationIds: ["citation-x"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-x",
          feedItemId: "feed-x",
          sourceItemId: "source-x",
          providerKey: "x-twitter",
          field: "title",
          canonicalUrl: "https://x.com/example/status/1",
        },
      ],
      storyClusters: [
        {
          id: "cluster-x",
          storyKey: "x:launch-image",
          representativeFeedItemId: "feed-x",
          duplicateFeedItemIds: [],
          interestIds: ["ai-developer-tools"],
          providerKeys: ["x-twitter"],
          score: 2.1,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
          },
          whyImportant: ["Visual launch evidence is easier to scan."],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-x",
          sourceItemId: "source-x",
          sourceBindingId: "binding-x",
          interestId: "ai-developer-tools",
          providerKey: "x-twitter",
          providerName: "X/Twitter",
          canonicalUrl: "https://x.com/example/status/1",
          title: "X post includes a launch image",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:00:00.000Z"),
          score: 2.1,
          whyImportant: ["Visual launch evidence is easier to scan."],
          previewMedia: {
            kind: "image",
            url: "https://pbs.twimg.com/media/launch.jpg",
            sourceUrl: "https://x.com/example/status/1",
            altText: "X post includes a launch image",
          },
        },
      ],
      qualityFlags: [],
    });

    expect(readerSummary.topReads[0]?.previewMedia).toEqual({
      kind: "image",
      url: "https://pbs.twimg.com/media/launch.jpg",
      sourceUrl: "https://x.com/example/status/1",
      altText: "X post includes a launch image",
    });
  });

  it("keeps ineligible cluster evidence out of reader top reads", () => {
    const readerSummary = buildReaderSummary({
      headline: "Mixed evidence cluster",
      executiveSummary:
        "A mixed cluster contains one weak Hacker News item and one strong Reddit item.",
      topStories: [
        {
          storyClusterId: "cluster-mixed",
          title: "Claude Code tracker allegation gets social attention",
          summary: "The strong Reddit discussion is the first read.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["hacker-news", "reddit"],
          citationIds: ["citation-weak", "citation-strong"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-weak",
          feedItemId: "feed-weak",
          sourceItemId: "source-weak",
          providerKey: "hacker-news",
          field: "title",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
        },
        {
          citationId: "citation-strong",
          feedItemId: "feed-strong",
          sourceItemId: "source-strong",
          providerKey: "reddit",
          field: "title",
          canonicalUrl: "https://reddit.example/r/ClaudeAI/comments/1",
        },
      ],
      storyClusters: [
        {
          id: "cluster-mixed",
          storyKey: "mixed:claude-code-tracker",
          representativeFeedItemId: "feed-weak",
          duplicateFeedItemIds: ["feed-strong"],
          interestIds: ["ai-developer-tools"],
          providerKeys: ["hacker-news", "reddit"],
          score: 2.5,
          observedAtRange: {
            startedAt: new Date("2026-07-06T08:00:00.000Z"),
            endedAt: new Date("2026-07-06T09:00:00.000Z"),
          },
          whyImportant: ["Mixed evidence cluster."],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-weak",
          sourceItemId: "source-weak",
          sourceBindingId: "binding-hn",
          interestId: "ai-developer-tools",
          providerKey: "hacker-news",
          providerName: "Hacker News",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
          title: "Weak HN discussion",
          publishedAt: new Date("2026-07-04T08:00:00.000Z"),
          observedAt: new Date("2026-07-06T08:00:00.000Z"),
          score: 0.8,
          whyImportant: ["Weak evidence should not lead."],
          providerMetricLabels: [
            { label: "Points", value: "1" },
            { label: "Comments", value: "0" },
          ],
          contentQuality: {
            qualityScore: 0.5,
            interestRelevanceScore: 0.4,
            engagementIntegrityScore: 0.8,
            eligibleForSummary: true,
            eligibleForTopRead: false,
            needsLlmReview: true,
            decision: "downrank",
            flags: ["weak_topic_match"],
            reason: "Weak topic match.",
          },
        },
        {
          feedItemId: "feed-strong",
          sourceItemId: "source-strong",
          sourceBindingId: "binding-reddit",
          interestId: "ai-developer-tools",
          providerKey: "reddit",
          providerName: "Reddit",
          canonicalUrl: "https://reddit.example/r/ClaudeAI/comments/1",
          title: "Strong Reddit discussion",
          publishedAt: new Date("2026-07-06T08:15:00.000Z"),
          observedAt: new Date("2026-07-06T08:20:00.000Z"),
          score: 2.5,
          whyImportant: ["Strong Reddit discussion is active."],
          providerMetricLabels: [
            { label: "Score", value: "727" },
            { label: "Comments", value: "140" },
          ],
        },
      ],
      qualityFlags: [],
    });

    expect(readerSummary.topReads[0]).toMatchObject({
      providerKey: "reddit",
      publishedAt: new Date("2026-07-06T08:15:00.000Z"),
      citationIds: ["citation-strong"],
    });
  });

  it("keeps social one-line takeaways content-first while requiring confirmation", () => {
    const readerSummary = buildReaderSummary({
      headline: "AI social pulse",
      executiveSummary:
        "Social sources point to AI infrastructure, rollout chatter and biomedical AI research.",
      topStories: [
        {
          storyClusterId: "cluster-reddit",
          title: "Why are AI labs building their own chips?",
          summary:
            "AI infrastructure discussion around custom chips is getting practical.",
          interestIds: ["ai-infrastructure"],
          providerKeys: ["reddit"],
          citationIds: ["citation-reddit"],
        },
        {
          storyClusterId: "cluster-x",
          title: "OpenAI Devs rollout chatter",
          summary: "Developer rollout chatter is drawing X/Twitter engagement.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["x-twitter"],
          citationIds: ["citation-x"],
        },
        {
          storyClusterId: "cluster-hn",
          title: "AI-assisted Alzheimer drug story",
          summary: "Biomedical AI research is drawing Hacker News discussion.",
          interestIds: ["ai-healthcare"],
          providerKeys: ["hacker-news"],
          citationIds: ["citation-hn"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-reddit",
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          providerKey: "reddit",
          field: "title",
          canonicalUrl: "https://reddit.example/r/localllama/comments/1",
        },
        {
          citationId: "citation-x",
          feedItemId: "feed-x",
          sourceItemId: "source-x",
          providerKey: "x-twitter",
          field: "title",
          canonicalUrl: "https://x.com/openai/status/1",
        },
        {
          citationId: "citation-hn",
          feedItemId: "feed-hn",
          sourceItemId: "source-hn",
          providerKey: "hacker-news",
          field: "title",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
        },
      ],
      storyClusters: [
        socialStoryCluster("cluster-reddit", "feed-reddit", "reddit", [
          "Story signal score 2.275",
          "Strong source engagement signal",
          "Passes source quality and interest relevance gate",
          "Fresh item in the current monitoring window",
        ]),
        socialStoryCluster("cluster-x", "feed-x", "x-twitter", [
          "Story signal score 2.211",
          "Strong source engagement signal",
          "Passes source quality and interest relevance gate",
          "Fresh item in the current monitoring window",
        ]),
        socialStoryCluster("cluster-hn", "feed-hn", "hacker-news", [
          "Story signal score 2.163",
          "Strong source engagement signal",
          "Passes source quality and interest relevance gate",
          "Fresh item in the current monitoring window",
        ]),
      ],
      selectedEvidence: [
        socialEvidenceItem({
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          sourceBindingId: "binding-reddit",
          interestId: "ai-infrastructure",
          providerKey: "reddit",
          providerName: "Reddit",
          title: "Why are AI labs building their own chips?",
          canonicalUrl: "https://reddit.example/r/localllama/comments/1",
          whyImportant: [
            "Story signal score 2.275",
            "Strong source engagement signal",
          ],
        }),
        socialEvidenceItem({
          feedItemId: "feed-x",
          sourceItemId: "source-x",
          sourceBindingId: "binding-x",
          interestId: "ai-developer-tools",
          providerKey: "x-twitter",
          providerName: "X/Twitter",
          title: "OpenAI Devs rollout chatter",
          canonicalUrl: "https://x.com/openai/status/1",
          whyImportant: [
            "Story signal score 2.211",
            "Strong source engagement signal",
          ],
        }),
        socialEvidenceItem({
          feedItemId: "feed-hn",
          sourceItemId: "source-hn",
          sourceBindingId: "binding-hn",
          interestId: "ai-healthcare",
          providerKey: "hacker-news",
          providerName: "Hacker News",
          title: "AI-assisted Alzheimer drug story",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
          whyImportant: [
            "Story signal score 2.163",
            "Strong source engagement signal",
          ],
        }),
      ],
      qualityFlags: [],
    });

    expect(readerSummary.oneLineTakeaway).toBe(
      "Developer rollout chatter is drawing X/Twitter engagement; AI infrastructure discussion around custom chips is getting practical; Biomedical AI research is drawing Hacker News discussion. Confirm important claims with another monitored source before acting.",
    );
    expect(readerSummary.oneLineTakeaway).not.toContain("Review 3 cited");
    expect(readerSummary.topReads.map((read) => read.reason)).toEqual([
      "Developer rollout chatter is drawing X/Twitter engagement.",
      "AI infrastructure discussion around custom chips is getting practical.",
      "Biomedical AI research is drawing Hacker News discussion.",
    ]);
    expect(
      readerSummary.topReads.flatMap((read) => read.whyImportant),
    ).not.toContain("Story signal score 2.211");
    expect(readerSummary.topReads.map((read) => read.providerKey)).toEqual([
      "x-twitter",
      "reddit",
      "hacker-news",
    ]);
  });

  it("keeps AI developer digest top reads in ranked story order", () => {
    const readerSummary = buildReaderSummary({
      headline: "Source watch across X/Twitter, Reddit, Hacker News +2",
      executiveSummary:
        "X/Twitter and Reddit carry the clearest AI developer workflow signals.",
      topStories: [
        {
          storyClusterId: "cluster-hn-rss",
          title:
            "HN and RSS amplify cybersecurity discussion around a post-mythos framing",
          summary: "A cybersecurity article is drawing HN and RSS discussion.",
          interestIds: ["cybersecurity"],
          providerKeys: ["hacker-news", "rss"],
          citationIds: ["citation-hn", "citation-rss"],
        },
        {
          storyClusterId: "cluster-x",
          title:
            "X chatter about Claude Code skills routing across coding tools",
          summary:
            "Claude Code skills routing is the strongest concrete X signal.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["x-twitter"],
          citationIds: ["citation-x"],
        },
        {
          storyClusterId: "cluster-reddit",
          title: "Reddit reports DFlash support merged into llama.cpp",
          summary: "Local model users are tracking a concrete runtime win.",
          interestIds: ["local-models"],
          providerKeys: ["reddit"],
          citationIds: ["citation-reddit"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-hn",
          feedItemId: "feed-hn",
          sourceItemId: "source-hn",
          providerKey: "hacker-news",
          field: "title",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
        },
        {
          citationId: "citation-rss",
          feedItemId: "feed-rss",
          sourceItemId: "source-rss",
          providerKey: "rss",
          field: "title",
          canonicalUrl: "https://example.test/security-story",
        },
        {
          citationId: "citation-x",
          feedItemId: "feed-x",
          sourceItemId: "source-x",
          providerKey: "x-twitter",
          field: "title",
          canonicalUrl: "https://x.com/rohanpaul_ai/status/1",
        },
        {
          citationId: "citation-reddit",
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          providerKey: "reddit",
          field: "title",
          canonicalUrl: "https://reddit.example/r/LocalLLaMA/comments/1",
        },
      ],
      storyClusters: [
        {
          ...socialStoryCluster("cluster-hn-rss", "feed-hn", "hacker-news", [
            "Strong source engagement signal",
          ]),
          duplicateFeedItemIds: ["feed-rss"],
          providerKeys: ["hacker-news", "rss"],
        },
        socialStoryCluster("cluster-x", "feed-x", "x-twitter", [
          "Strong source engagement signal",
        ]),
        socialStoryCluster("cluster-reddit", "feed-reddit", "reddit", [
          "Strong source engagement signal",
        ]),
      ],
      selectedEvidence: [
        socialEvidenceItem({
          feedItemId: "feed-hn",
          sourceItemId: "source-hn",
          sourceBindingId: "binding-hn",
          interestId: "cybersecurity",
          providerKey: "hacker-news",
          providerName: "Hacker News",
          title:
            "HN and RSS amplify cybersecurity discussion around a post-mythos framing",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
          whyImportant: ["Strong source engagement signal"],
        }),
        socialEvidenceItem({
          feedItemId: "feed-rss",
          sourceItemId: "source-rss",
          sourceBindingId: "binding-rss",
          interestId: "cybersecurity",
          providerKey: "rss",
          providerName: "RSS",
          title: "RSS repeats cybersecurity discussion",
          canonicalUrl: "https://example.test/security-story",
          whyImportant: ["Strong source engagement signal"],
        }),
        socialEvidenceItem({
          feedItemId: "feed-x",
          sourceItemId: "source-x",
          sourceBindingId: "binding-x",
          interestId: "ai-developer-tools",
          providerKey: "x-twitter",
          providerName: "X/Twitter",
          title:
            "X chatter about Claude Code skills routing across coding tools",
          canonicalUrl: "https://x.com/rohanpaul_ai/status/1",
          whyImportant: ["Strong source engagement signal"],
        }),
        socialEvidenceItem({
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          sourceBindingId: "binding-reddit",
          interestId: "local-models",
          providerKey: "reddit",
          providerName: "Reddit",
          title: "Reddit reports DFlash support merged into llama.cpp",
          canonicalUrl: "https://reddit.example/r/LocalLLaMA/comments/1",
          whyImportant: ["Strong source engagement signal"],
        }),
      ],
      qualityFlags: [],
    });

    expect(
      readerSummary.topReads.slice(0, 3).map((read) => read.providerKey),
    ).toEqual(["hacker-news", "x-twitter", "reddit"]);
    expect(readerSummary.headline).not.toContain("Key signals across");
    expect(readerSummary.headline).toContain("cybersecurity discussion");
    expect(readerSummary.headline).not.toContain(";");
    expect(readerSummary.headline).not.toContain("Source watch");
  });

  it("keeps single-provider repo radar summaries source-aware without repeating repo names as trend signals", () => {
    const readerSummary = buildReaderSummary({
      headline: "AI repo radar",
      executiveSummary:
        "Repo Radar found openai/codex, firecrawl/firecrawl and langchain-ai/langgraph as useful repository links.",
      topStories: [
        {
          storyClusterId: "cluster-1",
          title: "openai/codex",
          summary: "Fast-growing AI coding agent repository.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: ["citation-1"],
        },
        {
          storyClusterId: "cluster-2",
          title: "firecrawl/firecrawl",
          summary: "Web data infrastructure is gaining developer attention.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: ["citation-2"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-1",
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          providerKey: "github-repo-radar",
          field: "title",
          canonicalUrl:
            "https://reddit.com/r/programming/comments/codex/discussion",
        },
        {
          citationId: "citation-2",
          feedItemId: "feed-2",
          sourceItemId: "source-2",
          providerKey: "github-repo-radar",
          field: "title",
          canonicalUrl: "https://github.com/firecrawl/firecrawl",
        },
      ],
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "github:openai/codex",
          representativeFeedItemId: "feed-1",
          duplicateFeedItemIds: [],
          interestIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          score: 1,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
          },
          whyImportant: ["Repository is gaining stars quickly."],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          sourceBindingId: "binding-1",
          interestId: "ai-developer-tools",
          providerKey: "github-repo-radar",
          providerName: "Repo Radar",
          canonicalUrl:
            "https://reddit.com/r/programming/comments/codex/discussion",
          title: "openai/codex",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:00:00.000Z"),
          score: 1,
          whyImportant: ["Repository is gaining stars quickly."],
          readerActionKind: "watch_repository",
          providerMetricSummary: "+360 stars / 48h, 54,000 total stars",
          providerMetricLabels: [
            {
              label: "Evidence",
              value: "GH Archive WatchEvent - hourly updated",
            },
            { label: "Checked", value: "2026-06-23T09:00:00.000Z" },
            {
              label: "Source lag",
              value: "GH Archive can lag by about an hour",
            },
            { label: "Stars", value: "54,000" },
            { label: "Trend 24h", value: "+210 / 24h" },
            { label: "Trend 48h", value: "+360 / 48h" },
            { label: "Trend 7d", value: "+1200 / 7d" },
            { label: "Trend 30d", value: "+4800 / 30d" },
            { label: "Trend 90d", value: "+11000 / 90d" },
            { label: "Forks", value: "2,000" },
          ],
        },
        {
          feedItemId: "feed-2",
          sourceItemId: "source-2",
          sourceBindingId: "binding-1",
          interestId: "ai-developer-tools",
          providerKey: "github-repo-radar",
          providerName: "Repo Radar",
          canonicalUrl: "https://github.com/firecrawl/firecrawl",
          title: "firecrawl/firecrawl",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:00:00.000Z"),
          score: 1,
          readerActionKind: "watch_repository",
          whyImportant: [
            "Web data infrastructure is gaining developer attention.",
          ],
        },
      ],
      qualityFlags: [],
    });

    expect(readerSummary.sourceMix).toEqual([
      {
        providerKey: "github-repo-radar",
        itemCount: 2,
        citationCount: 2,
        storyClusterCount: 1,
        crossSourceClusterCount: 0,
        singleSourceOnly: true,
        interestIds: ["ai-developer-tools"],
      },
    ]);
    expect(readerSummary.qualityState).toMatchObject({
      status: "limited_sources",
      isSingleSource: true,
      warnings: ["Source coverage is limited and needs confirmation."],
    });
    expect(readerSummary.bullets).toContain(
      "1 follow-up link available in Top reads.",
    );
    expect(readerSummary.trendDelta.newSignals).toEqual([
      "2 Repo Radar items selected",
    ]);
    expect(readerSummary.trendDelta.newSignals.join(" ")).not.toContain(
      "openai/codex",
    );
    expect(readerSummary.openQuestions).toContain(
      "Is this signal confirmed outside Repo Radar?",
    );
    expect(readerSummary.topReads[0]).toMatchObject({
      title: "openai/codex",
      matchedInterestIds: ["ai-developer-tools"],
      matchedRules: [
        "interest:ai-developer-tools",
        "source-binding:binding-1",
        "provider:github-repo-radar",
      ],
      signalScore: 1,
      whyNow: "Current summary window has Repo Radar coverage.",
      providerMetrics: [
        {
          label: "Repo Radar evidence",
          value: "+360 stars / 48h, 54,000 total stars",
        },
        { label: "Evidence", value: "GH Archive WatchEvent - hourly updated" },
        { label: "Checked", value: "2026-06-23T09:00:00.000Z" },
        { label: "Source lag", value: "GH Archive can lag by about an hour" },
        { label: "Stars", value: "54,000" },
        { label: "Trend 24h", value: "+210 / 24h" },
        { label: "Trend 48h", value: "+360 / 48h" },
        { label: "Trend 7d", value: "+1200 / 7d" },
        { label: "Trend 30d", value: "+4800 / 30d" },
        { label: "Trend 90d", value: "+11000 / 90d" },
        { label: "Forks", value: "2,000" },
      ],
    });
    expect(
      readerSummary.topReads[0]?.providerMetrics.map((metric) => metric.label),
    ).not.toContain("Story signal");
    expect(readerSummary.topReads.map((item) => item.title)).toEqual([
      "openai/codex",
      "firecrawl/firecrawl",
    ]);
    expect(readerSummary.nextActions.map((action) => action.kind)).toEqual([
      "watch_repository",
      "watch_repository",
      "request_deeper_scan",
      "add_interest_rule",
      "mark_relevant",
      "mark_not_relevant",
    ]);
  });

  it("keeps the eight highest ranked stories available as reader top reads", () => {
    const input = readerTopReadFixture(12);
    const readerSummary = buildReaderSummary(input);

    expect(readerSummary.topReads).toHaveLength(8);
    expect(readerSummary.topReads.map((item) => item.title)).toEqual([
      "repo-radar/project-1",
      "repo-radar/project-2",
      "repo-radar/project-3",
      "repo-radar/project-4",
      "repo-radar/project-5",
      "repo-radar/project-6",
      "repo-radar/project-7",
      "repo-radar/project-8",
    ]);
    expect(readerSummary.topReads.map((item) => item.title)).not.toContain(
      "repo-radar/project-11",
    );
    expect(readerSummary.bullets).toContain(
      "7 follow-up links available in Top reads.",
    );
  });

  it("does not fill top reads with weak synthetic provider coverage", () => {
    const input = readerTopReadFixture(12);
    const providerOverrides = new Map<
      number,
      {
        readonly providerKey: string;
        readonly providerName: string;
        readonly title: string;
        readonly canonicalUrl: string;
        readonly readerActionKind: "read_source" | "watch_repository";
      }
    >([
      [
        7,
        {
          providerKey: "reddit",
          providerName: "Reddit",
          title: "Reddit discusses agent debugging friction",
          canonicalUrl: "https://reddit.com/r/ClaudeCode/comments/project_7",
          readerActionKind: "read_source",
        },
      ],
      [
        8,
        {
          providerKey: "hacker-news",
          providerName: "Hacker News",
          title: "HN compares repository agents",
          canonicalUrl: "https://news.ycombinator.com/item?id=8",
          readerActionKind: "read_source",
        },
      ],
      [
        9,
        {
          providerKey: "rss",
          providerName: "RSS",
          title: "RSS explains agent workflow releases",
          canonicalUrl: "https://example.test/agent-workflow-releases",
          readerActionKind: "read_source",
        },
      ],
    ]);
    const override = (index: number) => providerOverrides.get(index);

    const readerSummary = buildReaderSummary({
      ...input,
      topStories: input.topStories.map((story, offset) => {
        const index = offset + 1;
        const replacement = override(index);

        return replacement === undefined
          ? story
          : {
              ...story,
              title: replacement.title,
              providerKeys: [replacement.providerKey],
            };
      }),
      citationMap: input.citationMap.map((citation, offset) => {
        const index = offset + 1;
        const replacement = override(index);

        return replacement === undefined
          ? citation
          : {
              ...citation,
              providerKey: replacement.providerKey,
              canonicalUrl: replacement.canonicalUrl,
            };
      }),
      storyClusters: input.storyClusters.map((cluster, offset) => {
        const index = offset + 1;
        const replacement = override(index);

        return replacement === undefined
          ? cluster
          : {
              ...cluster,
              storyKey: `${replacement.providerKey}:project-${index}`,
              providerKeys: [replacement.providerKey],
            };
      }),
      selectedEvidence: input.selectedEvidence.map((item, offset) => {
        const index = offset + 1;
        const replacement = override(index);

        return replacement === undefined
          ? item
          : {
              ...item,
              providerKey: replacement.providerKey,
              providerName: replacement.providerName,
              canonicalUrl: replacement.canonicalUrl,
              title: replacement.title,
              readerActionKind: replacement.readerActionKind,
            };
      }),
    });

    expect(readerSummary.topReads).toHaveLength(8);
    expect(
      readerSummary.topReads.slice(0, 4).map((item) => ({
        title: item.title,
        providerKey: item.providerKey,
      })),
    ).toEqual([
      {
        title: "repo-radar/project-1",
        providerKey: "github-repo-radar",
      },
      {
        title: "repo-radar/project-2",
        providerKey: "github-repo-radar",
      },
      {
        title: "repo-radar/project-3",
        providerKey: "github-repo-radar",
      },
      {
        title: "repo-radar/project-4",
        providerKey: "github-repo-radar",
      },
    ]);
    expect(readerSummary.topReads.map((item) => item.title)).toContain(
      "repo-radar/project-2",
    );
    expect(readerSummary.trendDelta.newSignals).toEqual([
      "8 multi-source items selected",
    ]);
    expect(readerSummary.openQuestions).toContain(
      "Which top reads need confirmation from another monitored source?",
    );
  });

  it("deduplicates model top story repeats before applying the reader top read limit", () => {
    const input = readerTopReadFixture(11);
    const repeatedStory = input.topStories[0];
    if (repeatedStory === undefined) {
      throw new Error("Reader top read fixture must contain a story");
    }

    const readerSummary = buildReaderSummary({
      ...input,
      topStories: [
        repeatedStory,
        {
          ...repeatedStory,
          title: "repo-radar/project-1 repeated model output",
          summary: "The model repeated the same story cluster.",
        },
        ...input.topStories.slice(1),
      ],
    });

    expect(readerSummary.topReads).toHaveLength(8);
    expect(readerSummary.topReads.map((item) => item.title)).toEqual([
      "repo-radar/project-1",
      "repo-radar/project-2",
      "repo-radar/project-3",
      "repo-radar/project-4",
      "repo-radar/project-5",
      "repo-radar/project-6",
      "repo-radar/project-7",
      "repo-radar/project-8",
    ]);
    expect(readerSummary.topReads.map((item) => item.title)).not.toContain(
      "repo-radar/project-1 repeated model output",
    );
    expect(readerSummary.interestSections[0]?.items).toEqual([]);
  });

  it("deduplicates top reads by normalized canonical repository URLs", () => {
    const input = readerTopReadFixture(3);
    const firstStory = input.topStories[0];
    const duplicateStory = input.topStories[1];
    const nextStory = input.topStories[2];
    const firstCitation = input.citationMap[0];
    const duplicateCitation = input.citationMap[1];
    const nextCitation = input.citationMap[2];

    if (
      firstStory === undefined ||
      duplicateStory === undefined ||
      nextStory === undefined ||
      firstCitation === undefined ||
      duplicateCitation === undefined ||
      nextCitation === undefined
    ) {
      throw new Error("Reader top read fixture must contain three stories");
    }

    const readerSummary = buildReaderSummary({
      ...input,
      topStories: [
        firstStory,
        {
          ...duplicateStory,
          title: "repo-radar/project-1 with tracking parameters",
          summary: "The model emitted the same repository with a tracked URL.",
        },
        nextStory,
      ],
      citationMap: [
        firstCitation,
        {
          ...duplicateCitation,
          canonicalUrl:
            "https://github.com/Repo-Radar/Project-1/?utm_source=reddit#readme",
        },
        nextCitation,
      ],
    });

    expect(readerSummary.topReads.map((item) => item.title)).toEqual([
      "repo-radar/project-1",
      "repo-radar/project-3",
    ]);
  });

  it("keeps interest sections citation-only so top reads are not repeated", () => {
    const input = readerTopReadFixture(3);
    const readerSummary = buildReaderSummary({
      ...input,
      interestHighlights: [
        {
          interestId: "ai-developer-tools",
          title: "AI developer tools",
          summary: "Two repo radar links are the strongest first reads.",
          citationIds: ["citation-1", "citation-2"],
        },
        {
          interestId: "repo-radar",
          title: "Repo radar",
          summary:
            "The second section shares one citation but should show the next unique read.",
          citationIds: ["citation-1", "citation-3"],
        },
      ],
    });

    expect(
      readerSummary.interestSections.map((section) =>
        section.items.map((item) => item.title),
      ),
    ).toEqual([[], []]);
    expect(
      readerSummary.interestSections.map((section) => section.citationIds),
    ).toEqual([
      ["citation-1", "citation-2"],
      ["citation-1", "citation-3"],
    ]);
  });

  it("marks cross-source source mix when multiple providers confirm one story cluster", () => {
    const readerSummary = buildReaderSummary({
      headline: "AI agent pain signal",
      executiveSummary:
        "A GitHub repository is trending while Reddit discusses the same project pain point.",
      topStories: [
        {
          storyClusterId: "cluster-1",
          title: "openai/codex discussion expands",
          summary: "GitHub growth is backed by Reddit discussion.",
          interestIds: ["ai-agents"],
          providerKeys: ["github-repo-radar", "reddit"],
          citationIds: ["citation-1"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-1",
          feedItemId: "feed-github",
          sourceItemId: "source-github",
          providerKey: "github-repo-radar",
          field: "title",
          canonicalUrl: "https://github.com/openai/codex",
        },
        {
          citationId: "citation-2",
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          providerKey: "reddit",
          field: "canonicalUrl",
          canonicalUrl:
            "https://reddit.com/r/programming/comments/codex/discussion",
        },
      ],
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "github-repo:openai/codex",
          representativeFeedItemId: "feed-github",
          duplicateFeedItemIds: ["feed-reddit"],
          interestIds: ["ai-agents"],
          providerKeys: ["github-repo-radar", "reddit"],
          score: 2.4,
          signalBreakdown: {
            baseScore: 1.8,
            crossProviderSupport: 0.25,
            sameProviderSupport: 0,
            providerDiversityBoost: 0.25,
            interestDiversityBoost: 0,
            freshnessBoost: 0.1,
            totalScore: 2.4,
          },
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
          },
          whyImportant: [
            "Cross-source confirmation appeared in the summary window.",
          ],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-github",
          sourceItemId: "source-github",
          sourceBindingId: "binding-github",
          interestId: "ai-agents",
          providerKey: "github-repo-radar",
          providerName: "Repo Radar",
          canonicalUrl: "https://github.com/openai/codex",
          title: "openai/codex",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:00:00.000Z"),
          score: 2.4,
          whyImportant: ["Repository is gaining stars quickly."],
        },
        {
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          sourceBindingId: "binding-reddit",
          interestId: "ai-agents",
          providerKey: "reddit",
          providerName: "Reddit",
          canonicalUrl:
            "https://reddit.com/r/programming/comments/codex/discussion",
          title: "Reddit discusses openai/codex",
          publishedAt: new Date("2026-06-23T08:10:00.000Z"),
          observedAt: new Date("2026-06-23T08:20:00.000Z"),
          score: 1.4,
          whyImportant: ["Users are discussing implementation friction."],
        },
      ],
      qualityFlags: [],
    });

    expect(readerSummary.qualityState.status).toBe("ready");
    expect(readerSummary.sourceMix).toEqual([
      {
        providerKey: "reddit",
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        interestIds: ["ai-agents"],
      },
      {
        providerKey: "github-repo-radar",
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        interestIds: ["ai-agents"],
      },
    ]);
    expect(readerSummary.trendDelta.newSignals).toEqual([
      "1 cross-source item selected",
    ]);
    expect(readerSummary.topReads[0]?.whyNow).toBe(
      "Current summary window has cross-source coverage from Repo Radar, Reddit.",
    );
    expect(readerSummary.topReads[0]?.citationIds).toEqual([
      "citation-1",
      "citation-2",
    ]);
    expect(readerSummary.topReads[0]?.providerMetrics).toEqual([]);
  });
});

const readerTopReadFixture = (count: number) => {
  const indexes = Array.from({ length: count }, (_, index) => index + 1);

  return {
    headline: "Repo radar daily summary",
    executiveSummary:
      "Repo Radar selected the strongest repositories for today.",
    topStories: indexes.map(
      (index) =>
        ({
          storyClusterId: `cluster-${index}`,
          title: `repo-radar/project-${index}`,
          summary: `Repository ${index} is gaining attention.`,
          interestIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: [`citation-${index}`],
        }) satisfies TopReadCandidate,
    ),
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: indexes.map(
      (index) =>
        ({
          citationId: `citation-${index}`,
          feedItemId: `feed-${index}`,
          sourceItemId: `source-${index}`,
          providerKey: "github-repo-radar",
          field: "title",
          canonicalUrl: `https://github.com/repo-radar/project-${index}`,
        }) satisfies ReaderSummaryCitation,
    ),
    storyClusters: indexes.map(
      (index) =>
        ({
          id: `cluster-${index}`,
          storyKey: `github:repo-radar/project-${index}`,
          representativeFeedItemId: `feed-${index}`,
          duplicateFeedItemIds: [],
          interestIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          score: 1 - index / 100,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
          },
          whyImportant: [`Repository ${index} is gaining attention.`],
        }) satisfies StoryCluster,
    ),
    selectedEvidence: indexes.map(
      (index) =>
        ({
          feedItemId: `feed-${index}`,
          sourceItemId: `source-${index}`,
          sourceBindingId: "binding-repo-radar",
          interestId: "ai-developer-tools",
          providerKey: "github-repo-radar",
          providerName: "Repo Radar",
          canonicalUrl: `https://github.com/repo-radar/project-${index}`,
          title: `repo-radar/project-${index}`,
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:00:00.000Z"),
          score: 1 - index / 100,
          readerActionKind: "watch_repository",
          whyImportant: [`Repository ${index} is gaining attention.`],
        }) satisfies SummaryEvidenceItem,
    ),
    qualityFlags: [],
  };
};

const socialStoryCluster = (
  id: string,
  representativeFeedItemId: string,
  providerKey: string,
  whyImportant: readonly string[],
): StoryCluster =>
  ({
    id,
    storyKey: `${providerKey}:${representativeFeedItemId}`,
    representativeFeedItemId,
    duplicateFeedItemIds: [],
    interestIds: ["ai"],
    providerKeys: [providerKey],
    score: 2.1,
    observedAtRange: {
      startedAt: new Date("2026-06-28T08:00:00.000Z"),
      endedAt: new Date("2026-06-28T09:00:00.000Z"),
    },
    whyImportant,
  }) satisfies StoryCluster;

const socialEvidenceItem = (
  input: Omit<SummaryEvidenceItem, "publishedAt" | "observedAt" | "score">,
): SummaryEvidenceItem =>
  ({
    ...input,
    publishedAt: new Date("2026-06-28T08:00:00.000Z"),
    observedAt: new Date("2026-06-28T09:00:00.000Z"),
    score: 2.1,
  }) satisfies SummaryEvidenceItem;
