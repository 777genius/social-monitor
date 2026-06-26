import { buildReaderSummary } from "./reader-summary";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  SummaryEvidenceItem,
  StoryCluster,
} from "../value-objects/summary-evidence-item";

describe("buildReaderSummary", () => {
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
          topicIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: ["citation-1"],
        },
        {
          storyClusterId: "cluster-2",
          title: "firecrawl/firecrawl",
          summary: "Web data infrastructure is gaining developer attention.",
          topicIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: ["citation-2"],
        },
      ],
      topicHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-1",
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          providerKey: "github-repo-radar",
          field: "title",
          canonicalUrl: "https://github.com/openai/codex",
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
          topicIds: ["ai-developer-tools"],
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
          topicId: "ai-developer-tools",
          providerKey: "github-repo-radar",
          providerName: "Repo Radar",
          canonicalUrl: "https://github.com/openai/codex",
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
          topicId: "ai-developer-tools",
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
        topicIds: ["ai-developer-tools"],
      },
    ]);
    expect(readerSummary.qualityState).toMatchObject({
      status: "limited_sources",
      isSingleSource: true,
      warnings: ["Source coverage is limited or single-source."],
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
      matchedTopicIds: ["ai-developer-tools"],
      matchedRules: [
        "topic:ai-developer-tools",
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
      "add_topic_rule",
      "mark_relevant",
      "mark_not_relevant",
    ]);
  });

  it("keeps the ten highest ranked stories available as reader top reads", () => {
    const input = readerTopReadFixture(12);
    const readerSummary = buildReaderSummary(input);

    expect(readerSummary.topReads).toHaveLength(10);
    expect(readerSummary.topReads.map((item) => item.title)).toEqual([
      "repo-radar/project-1",
      "repo-radar/project-2",
      "repo-radar/project-3",
      "repo-radar/project-4",
      "repo-radar/project-5",
      "repo-radar/project-6",
      "repo-radar/project-7",
      "repo-radar/project-8",
      "repo-radar/project-9",
      "repo-radar/project-10",
    ]);
    expect(readerSummary.topReads.map((item) => item.title)).not.toContain(
      "repo-radar/project-11",
    );
    expect(readerSummary.bullets).toContain(
      "9 follow-up links available in Top reads.",
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

    expect(readerSummary.topReads).toHaveLength(10);
    expect(readerSummary.topReads.map((item) => item.title)).toEqual([
      "repo-radar/project-1",
      "repo-radar/project-2",
      "repo-radar/project-3",
      "repo-radar/project-4",
      "repo-radar/project-5",
      "repo-radar/project-6",
      "repo-radar/project-7",
      "repo-radar/project-8",
      "repo-radar/project-9",
      "repo-radar/project-10",
    ]);
    expect(readerSummary.topReads.map((item) => item.title)).not.toContain(
      "repo-radar/project-1 repeated model output",
    );
    expect(
      readerSummary.topicSections[0]?.items.map((item) => item.title),
    ).toEqual([
      "repo-radar/project-1",
      "repo-radar/project-2",
      "repo-radar/project-3",
    ]);
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

  it("does not repeat the same top read across topic sections", () => {
    const input = readerTopReadFixture(3);
    const readerSummary = buildReaderSummary({
      ...input,
      topicHighlights: [
        {
          topicId: "ai-developer-tools",
          title: "AI developer tools",
          summary: "Two repo radar links are the strongest first reads.",
          citationIds: ["citation-1", "citation-2"],
        },
        {
          topicId: "repo-radar",
          title: "Repo radar",
          summary:
            "The second section shares one citation but should show the next unique read.",
          citationIds: ["citation-1", "citation-3"],
        },
      ],
    });

    expect(
      readerSummary.topicSections.map((section) =>
        section.items.map((item) => item.title),
      ),
    ).toEqual([
      ["repo-radar/project-1", "repo-radar/project-2"],
      ["repo-radar/project-3"],
    ]);
  });

  it("keeps GitHub Trending page summaries distinct from Repo Radar", () => {
    const readerSummary = buildReaderSummary({
      headline: "GitHub Trending today",
      executiveSummary:
        "GitHub Trending surfaced calesthio/OpenMontage as the strongest page-ranked repository today.",
      topStories: [
        {
          storyClusterId: "cluster-1",
          title: "calesthio/OpenMontage",
          summary:
            "Agentic video production repository is leading GitHub Trending today.",
          topicIds: ["ai-developer-tools"],
          providerKeys: ["github-trending-page"],
          citationIds: ["citation-1"],
        },
      ],
      topicHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-1",
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          providerKey: "github-trending-page",
          field: "title",
          canonicalUrl: "https://github.com/calesthio/OpenMontage",
        },
      ],
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "github-trending:calesthio/OpenMontage",
          representativeFeedItemId: "feed-1",
          duplicateFeedItemIds: [],
          topicIds: ["ai-developer-tools"],
          providerKeys: ["github-trending-page"],
          score: 1.5,
          observedAtRange: {
            startedAt: new Date("2026-06-24T08:00:00.000Z"),
            endedAt: new Date("2026-06-24T09:00:00.000Z"),
          },
          whyImportant: [
            "Repository is ranked #1 on the GitHub Trending page.",
          ],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          sourceBindingId: "binding-trending",
          topicId: "ai-developer-tools",
          providerKey: "github-trending-page",
          providerName: "GitHub Trending",
          canonicalUrl: "https://github.com/calesthio/OpenMontage",
          title: "calesthio/OpenMontage",
          publishedAt: new Date("2026-06-24T08:00:00.000Z"),
          observedAt: new Date("2026-06-24T09:00:00.000Z"),
          score: 1.5,
          readerActionKind: "watch_repository",
          whyImportant: [
            "Repository is ranked #1 on the GitHub Trending page.",
          ],
          providerMetricSummary: "#1, +3,703 stars today",
          providerMetricLabels: [
            {
              label: "GitHub Trending today",
              value: "#1, +3,703 stars today",
            },
            { label: "Stars", value: "18,398" },
            { label: "Forks", value: "2,113" },
          ],
        },
      ],
      qualityFlags: [],
    });

    expect(readerSummary.sourceMix).toEqual([
      expect.objectContaining({
        providerKey: "github-trending-page",
        itemCount: 1,
      }),
    ]);
    expect(readerSummary.trendDelta.newSignals).toEqual([
      "1 GitHub Trending item selected",
    ]);
    expect(readerSummary.openQuestions).toContain(
      "Is this signal confirmed outside GitHub Trending?",
    );
    expect(readerSummary.topReads[0]).toMatchObject({
      providerKey: "github-trending-page",
      whyNow: "Current summary window has GitHub Trending coverage.",
      providerMetrics: [
        {
          label: "GitHub Trending evidence",
          value: "#1, +3,703 stars today",
        },
        {
          label: "GitHub Trending today",
          value: "#1, +3,703 stars today",
        },
        { label: "Stars", value: "18,398" },
        { label: "Forks", value: "2,113" },
      ],
    });
    expect(readerSummary.nextActions[0]).toEqual(
      expect.objectContaining({
        kind: "watch_repository",
        label: "Watch calesthio/OpenMontage",
      }),
    );
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
          topicIds: ["ai-agents"],
          providerKeys: ["github-repo-radar", "reddit"],
          citationIds: ["citation-1"],
        },
      ],
      topicHighlights: [],
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
          canonicalUrl: "https://github.com/openai/codex",
        },
      ],
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "github-repo:openai/codex",
          representativeFeedItemId: "feed-github",
          duplicateFeedItemIds: ["feed-reddit"],
          topicIds: ["ai-agents"],
          providerKeys: ["github-repo-radar", "reddit"],
          score: 2.4,
          signalBreakdown: {
            baseScore: 1.8,
            crossProviderSupport: 0.25,
            sameProviderSupport: 0,
            providerDiversityBoost: 0.25,
            topicDiversityBoost: 0,
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
          topicId: "ai-agents",
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
          topicId: "ai-agents",
          providerKey: "reddit",
          providerName: "Reddit",
          canonicalUrl: "https://github.com/openai/codex",
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
        providerKey: "github-repo-radar",
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ["ai-agents"],
      },
      {
        providerKey: "reddit",
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ["ai-agents"],
      },
    ]);
    expect(readerSummary.topReads[0]?.whyNow).toBe(
      "Current summary window has cross-source coverage from Repo Radar, Reddit and clustered 1 related item.",
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
          topicIds: ["ai-developer-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: [`citation-${index}`],
        }) satisfies TopReadCandidate,
    ),
    topicHighlights: [],
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
          topicIds: ["ai-developer-tools"],
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
          topicId: "ai-developer-tools",
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
