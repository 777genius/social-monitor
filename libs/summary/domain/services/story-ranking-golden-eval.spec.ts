import {
  tenantId,
  workspaceId,
  type Clock,
} from "@social-monitor/shared-kernel";

import { buildReaderSummary } from "../aggregates/reader-summary";
import { StoryClusteringService } from "./story-clustering.service";
import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryContent } from "../entities/reader-summary-artifact";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";

const clock: Clock = {
  now: () => new Date("2026-06-23T12:00:00.000Z"),
};

describe("story ranking golden eval", () => {
  it("orders deduplicated summary stories across provider systems without raw metric confusion", () => {
    const golden = buildReaderSummaryFromEvidence([
      evidence({
        feedItemId: "github-codex",
        sourceItemId: "repo-openai-codex",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/openai/codex",
        title: "openai/codex",
        score: 2.35,
        ...githubRepoMetricFacts(54000, 360),
      }),
      evidence({
        feedItemId: "hn-codex",
        sourceItemId: "hn-openai-codex",
        providerKey: "hacker-news",
        canonicalUrl: "https://news.ycombinator.com/item?id=4001",
        title: "OpenAI codex launch discussion for openai/codex",
        score: 1.8,
        ...hnMetricFacts(420, 96),
      }),
      evidence({
        feedItemId: "github-openmontage",
        sourceItemId: "trending-openmontage",
        providerKey: "github-trending-page",
        canonicalUrl: "https://github.com/calesthio/OpenMontage",
        title: "calesthio/OpenMontage",
        score: 2.45,
        ...githubTrendingMetricFacts(1, 3703),
      }),
      evidence({
        feedItemId: "reddit-openmontage",
        sourceItemId: "reddit-openmontage",
        providerKey: "reddit",
        canonicalUrl:
          "https://www.reddit.com/r/LocalLLaMA/comments/openmontage",
        title: "Weak Reddit discussion about calesthio/OpenMontage",
        score: 0.5,
        ...redditMetricFacts(22, 9),
      }),
      ...sameSubredditDuplicates(),
      evidence({
        feedItemId: "reddit-viral",
        sourceItemId: "reddit-viral",
        providerKey: "reddit",
        canonicalUrl:
          "https://www.reddit.com/r/programming/comments/viral_pricing_backlash",
        title: "Viral Reddit pricing backlash",
        score: 2.35,
        ...redditMetricFacts(8400, 1200),
      }),
      evidence({
        feedItemId: "false-release",
        sourceItemId: "false-release",
        providerKey: "reddit",
        canonicalUrl: "https://example.com/anthropic-release",
        title: "Anthropic launches developer agents",
        storyKeyHint: "title:anthropic-launches-developer-agents",
        score: 2.1,
      }),
      evidence({
        feedItemId: "false-outage",
        sourceItemId: "false-outage",
        providerKey: "hacker-news",
        canonicalUrl: "https://example.com/anthropic-outage",
        title: "Anthropic launches developer agents",
        storyKeyHint: "title:anthropic-launches-developer-agents",
        score: 2,
      }),
    ]);
    const { readerSummary, selection } = golden;
    const evalResult = evaluateGoldenRanking({
      readerSummary,
      selection,
      expectedTopReadTitles: [
        "openai/codex",
        "calesthio/OpenMontage",
        "Same subreddit browser-agent duplicate 1",
        "Viral Reddit pricing backlash",
        "Anthropic launches developer agents",
        "Anthropic launches developer agents",
      ],
      falseMergePairs: [["false-release", "false-outage"]],
      falseSplitPairs: [
        ["github-codex", "hn-codex"],
        ["github-openmontage", "reddit-openmontage"],
      ],
      crossProviderPreferences: [
        {
          preferredTitle: "openai/codex",
          demotedTitle: "Viral Reddit pricing backlash",
        },
        {
          preferredTitle: "calesthio/OpenMontage",
          demotedTitle: "Same subreddit browser-agent duplicate 1",
        },
      ],
    });

    expect(readerSummary.topReads.map((item) => item.title)).toEqual([
      "openai/codex",
      "calesthio/OpenMontage",
      "Same subreddit browser-agent duplicate 1",
      "Viral Reddit pricing backlash",
      "Anthropic launches developer agents",
      "Anthropic launches developer agents",
    ]);
    expect(readerSummary.topReads[0]?.providerMetrics).toEqual(
      expect.arrayContaining([
        {
          label: "Repo Radar evidence",
          value: "+360 stars / 48h, 54,000 total stars",
        },
        {
          label: "Hacker News evidence",
          value: "420 points, 96 comments",
        },
      ]),
    );
    expect(readerSummary.topReads[1]?.providerMetrics).toEqual(
      expect.arrayContaining([
        {
          label: "GitHub Trending evidence",
          value: "#1, +3,703 stars today",
        },
        {
          label: "Reddit evidence",
          value: "22 score, 9 comments, 91% upvoted",
        },
      ]),
    );
    expect(
      readerSummary.topReads
        .flatMap((item) => item.providerMetrics)
        .map((metric) => metric.label),
    ).not.toEqual(
      expect.arrayContaining([
        "Story signal",
        "Base signal",
        "Cross-source support",
        "Same-source support",
        "Provider diversity",
        "Interest diversity",
        "Freshness",
        "Confirmed by",
        "Evidence items",
      ]),
    );
    expect(
      readerSummary.topReads.slice(4).map((item) => item.canonicalUrl),
    ).toEqual([
      "https://example.com/anthropic-release",
      "https://example.com/anthropic-outage",
    ]);
    expect(selection.rankingPolicyVersion).toBe(
      STORY_RANKING_POLICY_V1.version,
    );
    expect(evalResult).toEqual({
      topKOrderAccuracy: 1,
      falseMergeRate: 0,
      falseSplitRate: 0,
      crossProviderPreference: 1,
    });
    expect(evalResult.topKOrderAccuracy).toBeGreaterThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.minTopKOrderAccuracy,
    );
    expect(evalResult.falseMergeRate).toBeLessThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.maxFalseMergeRate,
    );
    expect(evalResult.falseSplitRate).toBeLessThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.maxFalseSplitRate,
    );
    expect(evalResult.crossProviderPreference).toBeGreaterThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.minCrossProviderPreference,
    );
  });

  it("keeps the reader-facing UX contract stable for normalized and provider-native metrics", () => {
    const { readerSummary } = buildReaderSummaryFromEvidence([
      evidence({
        feedItemId: "github-codex",
        sourceItemId: "repo-openai-codex",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/openai/codex",
        title: "openai/codex",
        score: 2.35,
        ...githubRepoMetricFacts(54000, 360),
      }),
      evidence({
        feedItemId: "reddit-codex",
        sourceItemId: "reddit-openai-codex",
        providerKey: "reddit",
        canonicalUrl:
          "https://www.reddit.com/r/programming/comments/openai_codex",
        title: "Reddit debates openai/codex",
        score: 1.7,
        ...redditMetricFacts(510, 88),
      }),
    ]);

    expect({
      title: readerSummary.topReads[0]?.title,
      signalScore: readerSummary.topReads[0]?.signalScore,
      providerMetrics: readerSummary.topReads[0]?.providerMetrics,
      whyNow: readerSummary.topReads[0]?.whyNow,
    }).toMatchInlineSnapshot(`
{
  "providerMetrics": [
    {
      "label": "Repo Radar evidence",
      "value": "+360 stars / 48h, 54,000 total stars",
    },
    {
      "label": "Evidence",
      "value": "GH Archive WatchEvent - hourly updated",
    },
    {
      "label": "Checked",
      "value": "2026-06-23T12:00:00.000Z",
    },
    {
      "label": "Source lag",
      "value": "GH Archive can lag by about an hour",
    },
    {
      "label": "Stars",
      "value": "54,000",
    },
    {
      "label": "Trend 48h",
      "value": "+360 / 48h",
    },
    {
      "label": "Reddit evidence",
      "value": "510 score, 88 comments, 91% upvoted",
    },
    {
      "label": "Score",
      "value": "510",
    },
    {
      "label": "Comments",
      "value": "88",
    },
    {
      "label": "Upvote ratio",
      "value": "91%",
    },
  ],
  "signalScore": 3.08,
  "title": "openai/codex",
  "whyNow": "Current summary window has cross-source coverage from Repo Radar, Reddit.",
}
`);
  });

  it("covers small communities, viral X noise, forks, HN GitHub discussions and repost traps", () => {
    const { readerSummary, selection } = buildReaderSummaryFromEvidence([
      evidence({
        feedItemId: "github-codex-main",
        sourceItemId: "repo-openai-codex-main",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/openai/codex",
        title: "openai/codex",
        score: 2,
        ...githubRepoMetricFacts(54000, 360),
      }),
      evidence({
        feedItemId: "hn-codex-discussion",
        sourceItemId: "hn-codex-discussion",
        providerKey: "hacker-news",
        canonicalUrl: "https://news.ycombinator.com/item?id=5001",
        title: "Ask HN: Is openai/codex changing agent workflows?",
        bodyPreview:
          "HN links to https://github.com/openai/codex and compares real usage.",
        score: 1.6,
        ...hnMetricFacts(210, 64),
      }),
      evidence({
        feedItemId: "small-subreddit-codex",
        sourceItemId: "reddit-small-codex",
        providerKey: "reddit",
        canonicalUrl:
          "https://www.reddit.com/r/LocalLLaMA/comments/small_codex",
        title: "Small subreddit tests openai/codex on local workflows",
        bodyPreview: "Low-score but detailed discussion of openai/codex.",
        score: 0.95,
        ...redditMetricFacts(38, 31),
      }),
      evidence({
        feedItemId: "x-viral-agent-rumor",
        sourceItemId: "x-viral-agent-rumor",
        providerKey: "x",
        canonicalUrl: "https://x.com/example/status/9001",
        title: "Viral AI agent rumor thread",
        score: 2.6,
        ...xMetricFacts(140000, 21000, 3500),
      }),
      evidence({
        feedItemId: "github-codex-fork",
        sourceItemId: "repo-fork-codex",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/community/codex-fork",
        title: "community/codex-fork",
        score: 1.7,
        ...githubRepoMetricFacts(1200, 70),
      }),
      evidence({
        feedItemId: "reddit-repost-main",
        sourceItemId: "reddit-repost-main",
        providerKey: "reddit",
        canonicalUrl: "https://example.com/browser-agent-repost",
        title: "Browser agent benchmark repost",
        score: 1.5,
        ...redditMetricFacts(620, 80),
      }),
      evidence({
        feedItemId: "reddit-repost-copy",
        sourceItemId: "reddit-repost-copy",
        providerKey: "reddit",
        canonicalUrl:
          "https://example.com/browser-agent-repost?utm_source=reddit",
        title: "Browser agent benchmark repost copy",
        score: 1.4,
        ...redditMetricFacts(310, 42),
      }),
      evidence({
        feedItemId: "same-title-launch",
        sourceItemId: "same-title-launch",
        providerKey: "hacker-news",
        canonicalUrl: "https://example.com/company-launch",
        title: "Acme launches developer agents",
        score: 1.35,
      }),
      evidence({
        feedItemId: "same-title-outage",
        sourceItemId: "same-title-outage",
        providerKey: "reddit",
        canonicalUrl: "https://example.com/company-outage",
        title: "Acme launches developer agents",
        score: 1.3,
      }),
    ]);
    const clusterByFeedItemId = clusterIdsByFeedItem(selection);
    const titles = readerSummary.topReads.map((item) => item.title);

    expect(titles.indexOf("openai/codex")).toBeLessThan(
      titles.indexOf("Viral AI agent rumor thread"),
    );
    expect(clusterByFeedItemId.get("github-codex-main")).toBe(
      clusterByFeedItemId.get("hn-codex-discussion"),
    );
    expect(clusterByFeedItemId.get("github-codex-main")).toBe(
      clusterByFeedItemId.get("small-subreddit-codex"),
    );
    expect(clusterByFeedItemId.get("github-codex-main")).not.toBe(
      clusterByFeedItemId.get("github-codex-fork"),
    );
    expect(clusterByFeedItemId.get("reddit-repost-main")).toBe(
      clusterByFeedItemId.get("reddit-repost-copy"),
    );
    expect(clusterByFeedItemId.get("same-title-launch")).not.toBe(
      clusterByFeedItemId.get("same-title-outage"),
    );
    expect(readerSummary.topReads[0]).toEqual(
      expect.objectContaining({
        title: "openai/codex",
        confirmedProviderKeys: ["github-repo-radar", "hacker-news", "reddit"],
        confidence: expect.objectContaining({ level: "high" }),
      }),
    );
  });
});

const buildReaderSummaryFromEvidence = (
  items: readonly SummaryEvidenceItem[],
) => {
  const selection = new StoryClusteringService(clock).cluster({
    identity: {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
    },
    items,
    limit: 10,
  });
  const citationMap = selection.selectedEvidence.map((item, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: "title" as const,
    canonicalUrl: item.canonicalUrl,
  })) satisfies readonly ReaderSummaryCitation[];
  const citationIdByFeedItemId = new Map(
    citationMap.map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const evidenceById = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const topStories = selection.clusters.map((cluster) => {
    const representative = evidenceById.get(cluster.representativeFeedItemId);

    return {
      storyClusterId: cluster.id,
      title: representative?.title ?? cluster.storyKey,
      summary: `${representative?.title ?? cluster.storyKey} selected by golden ranking eval.`,
      interestIds: cluster.interestIds,
      providerKeys: cluster.providerKeys,
      citationIds: [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ].flatMap((feedItemId) => citationIdByFeedItemId.get(feedItemId) ?? []),
    } satisfies TopReadCandidate;
  });

  return {
    selection,
    readerSummary: buildReaderSummary({
      headline: "Golden ranking eval",
      executiveSummary:
        "Golden ranking eval validates provider-aware story order.",
      topStories,
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap,
      storyClusters: selection.clusters,
      selectedEvidence: selection.selectedEvidence,
      qualityFlags: [],
    }),
  };
};

type GoldenRankingEvalInput = {
  readonly readerSummary: ReaderSummaryContent;
  readonly selection: SummaryEvidenceSelection;
  readonly expectedTopReadTitles: readonly string[];
  readonly falseMergePairs: readonly (readonly [string, string])[];
  readonly falseSplitPairs: readonly (readonly [string, string])[];
  readonly crossProviderPreferences: readonly {
    readonly preferredTitle: string;
    readonly demotedTitle: string;
  }[];
};

const evaluateGoldenRanking = (input: GoldenRankingEvalInput) => {
  const actualTitles = input.readerSummary.topReads.map((item) => item.title);
  const clusterByFeedItemId = new Map<string, string>();
  for (const cluster of input.selection.clusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      clusterByFeedItemId.set(feedItemId, cluster.id);
    }
  }

  return {
    topKOrderAccuracy: ratio(
      input.expectedTopReadTitles.filter(
        (title, index) => actualTitles[index] === title,
      ).length,
      input.expectedTopReadTitles.length,
    ),
    falseMergeRate: ratio(
      input.falseMergePairs.filter(
        ([left, right]) =>
          clusterByFeedItemId.get(left) === clusterByFeedItemId.get(right),
      ).length,
      input.falseMergePairs.length,
    ),
    falseSplitRate: ratio(
      input.falseSplitPairs.filter(
        ([left, right]) =>
          clusterByFeedItemId.get(left) !== clusterByFeedItemId.get(right),
      ).length,
      input.falseSplitPairs.length,
    ),
    crossProviderPreference: ratio(
      input.crossProviderPreferences.filter(
        (preference) =>
          actualTitles.indexOf(preference.preferredTitle) >= 0 &&
          actualTitles.indexOf(preference.preferredTitle) <
            actualTitles.indexOf(preference.demotedTitle),
      ).length,
      input.crossProviderPreferences.length,
    ),
  };
};

const ratio = (value: number, total: number): number =>
  total <= 0 ? 0 : Math.round((value / total) * 1000) / 1000;

const clusterIdsByFeedItem = (
  selection: SummaryEvidenceSelection,
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const cluster of selection.clusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      result.set(feedItemId, cluster.id);
    }
  }

  return result;
};

const sameSubredditDuplicates = (): readonly SummaryEvidenceItem[] =>
  Array.from({ length: 10 }, (_, index) =>
    evidence({
      feedItemId: `same-subreddit-${index + 1}`,
      sourceItemId: `same-subreddit-${index + 1}`,
      providerKey: "reddit",
      canonicalUrl: "https://example.com/browser-agent-rumor",
      title: `Same subreddit browser-agent duplicate ${index + 1}`,
      score: 2.25 - index * 0.01,
      ...redditMetricFacts(900 - index * 10, 80 - index),
    }),
  );

const evidence = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => {
  const providerKey = overrides.providerKey ?? "reddit";

  return {
    feedItemId: "feed-1",
    sourceItemId: "source-1",
    sourceBindingId: "binding-1",
    interestId: "interest-ai",
    providerKey,
    providerName: providerNameForProvider(providerKey),
    canonicalUrl: "https://example.com/default",
    title: "Default evidence",
    publishedAt: new Date("2026-06-23T10:00:00.000Z"),
    observedAt: new Date("2026-06-23T10:30:00.000Z"),
    score: 1,
    whyImportant: ["Golden eval evidence."],
    ...overrides,
  };
};

const providerNameForProvider = (providerKey: string): string => {
  switch (providerKey) {
    case "github-repo-radar":
      return "Repo Radar";
    case "github-trending-page":
      return "GitHub Trending";
    case "hacker-news":
      return "Hacker News";
    case "reddit":
      return "Reddit";
    case "x":
      return "X";
    default:
      return providerKey;
  }
};

const githubRepoMetricFacts = (stars: number, trendValue: number) => ({
  providerMetricLabels: [
    { label: "Evidence", value: "GH Archive WatchEvent - hourly updated" },
    { label: "Checked", value: "2026-06-23T12:00:00.000Z" },
    { label: "Source lag", value: "GH Archive can lag by about an hour" },
    { label: "Stars", value: stars.toLocaleString("en-US") },
    { label: "Trend 48h", value: `+${trendValue} / 48h` },
  ],
  providerMetricSummary: `+${trendValue} stars / 48h, ${stars.toLocaleString("en-US")} total stars`,
});

const githubTrendingMetricFacts = (rank: number, starsGained: number) => ({
  providerMetricLabels: [
    {
      label: "GitHub Trending today",
      value: `#${rank}, +${starsGained.toLocaleString("en-US")} stars today`,
    },
    { label: "Stars", value: "18,398" },
    { label: "Forks", value: "2,113" },
  ],
  providerMetricSummary: `#${rank}, +${starsGained.toLocaleString("en-US")} stars today`,
});

const redditMetricFacts = (score: number, comments: number) => ({
  providerMetricLabels: [
    { label: "Score", value: score.toLocaleString("en-US") },
    { label: "Comments", value: comments.toLocaleString("en-US") },
    { label: "Upvote ratio", value: "91%" },
  ],
  providerMetricSummary: `${score.toLocaleString("en-US")} score, ${comments.toLocaleString("en-US")} comments, 91% upvoted`,
});

const hnMetricFacts = (points: number, comments: number) => ({
  providerMetricLabels: [
    { label: "Points", value: points.toLocaleString("en-US") },
    { label: "Comments", value: comments.toLocaleString("en-US") },
  ],
  providerMetricSummary: `${points.toLocaleString("en-US")} points, ${comments.toLocaleString("en-US")} comments`,
});

const xMetricFacts = (likes: number, reposts: number, replies: number) => ({
  providerMetricLabels: [
    { label: "Likes", value: likes.toLocaleString("en-US") },
    { label: "Reposts", value: reposts.toLocaleString("en-US") },
    { label: "Replies", value: replies.toLocaleString("en-US") },
  ],
  providerMetricSummary: `${likes.toLocaleString("en-US")} likes, ${reposts.toLocaleString("en-US")} reposts, ${replies.toLocaleString("en-US")} replies`,
});
