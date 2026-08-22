import {
  buildReaderSummaryTopicMap,
  type SummaryEvidenceSelection,
} from "@social-monitor/summary/domain";

import {
  omitGitHubEvidence,
  resolveHistoricalGitHubOmission,
} from "./reader-summary-historical-github-omission";

describe("historical GitHub omission", () => {
  it("requires an explicit flag and reason for one completed UTC day", () => {
    const authorizedAt = new Date("2026-07-20T22:00:00.000Z");
    expect(
      resolveHistoricalGitHubOmission({
        argv: ["--allow-historical-github-omission"],
        reason: "No timestamp-valid GitHub snapshot exists.",
        cadence: "daily",
        timezone: "UTC",
        periodStartedAt: new Date("2026-07-19T00:00:00.000Z"),
        periodEndedAt: new Date("2026-07-20T00:00:00.000Z"),
        now: authorizedAt,
      }),
    ).toEqual({
      reason: "No timestamp-valid GitHub snapshot exists.",
      authorizedAt,
      readerQuality: "limited_sources",
    });
  });

  it("fails closed for incomplete or current-day authorization", () => {
    const input = {
      argv: [] as string[],
      reason: "No timestamp-valid GitHub snapshot exists.",
      cadence: "daily",
      timezone: "UTC",
      periodStartedAt: new Date("2026-07-20T00:00:00.000Z"),
      periodEndedAt: new Date("2026-07-21T00:00:00.000Z"),
      now: new Date("2026-07-20T22:00:00.000Z"),
    };
    expect(() => resolveHistoricalGitHubOmission(input)).toThrow(
      "requires both",
    );
    expect(() =>
      resolveHistoricalGitHubOmission({
        ...input,
        argv: ["--allow-historical-github-omission"],
      }),
    ).toThrow("one completed exact UTC day");
  });

  it("rebuilds a mixed cluster from its retained social evidence", () => {
    const selection = fixtureSelection();
    const omitted = omitGitHubEvidence(selection);
    const retainedCluster = omitted.clusters[0];

    expect(omitted.selectedEvidence.map((item) => item.providerKey)).toEqual([
      "hacker-news",
    ]);
    expect(retainedCluster).toMatchObject({
      representativeFeedItemId: "feed-hn",
      duplicateFeedItemIds: [],
      interestIds: ["interest-ai"],
      providerKeys: ["hacker-news"],
      score: 1,
      signalBreakdown: {
        baseScore: 1,
        crossProviderSupport: 0,
        providerDiversityBoost: 0,
        totalScore: 1,
      },
      observedAtRange: {
        startedAt: new Date("2026-07-19T12:01:00.000Z"),
        endedAt: new Date("2026-07-19T12:01:00.001Z"),
      },
      whyImportant: ["Relevant HN story"],
    });
    expect(retainedCluster?.id).toMatch(/^historical-retained:[a-f0-9]{64}$/u);
    expect(retainedCluster?.storyKey).toMatch(
      /^historical-retained:[a-f0-9]{64}$/u,
    );
    expect(omitted.sourceWindow.selectedFeedItemIds).toEqual(["feed-hn"]);
    expect(omitted.sourceWindow.storyClusterIds).toEqual([
      retainedCluster?.id,
    ]);
    expect(omitted.sourceWindow.windowId).toMatch(
      /^historical-github-omission:[a-f0-9]{64}$/u,
    );
    expect(omitted.sourceWindow).toMatchObject({
      startedAt: new Date("2026-07-19T12:00:00.000Z"),
      endedAt: new Date("2026-07-19T12:00:00.001Z"),
    });

    const topicMap = buildReaderSummaryTopicMap({
      clusters: omitted.clusters,
      selectedEvidence: omitted.selectedEvidence,
      topStories: [],
      citationMap: [
        {
          citationId: "citation-hn",
          feedItemId: "feed-hn",
          sourceItemId: "source-hn",
          providerKey: "hacker-news",
          field: "title",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
        },
      ],
    });
    expect(topicMap.nodes).toEqual([
      expect.objectContaining({
        storyClusterIds: [retainedCluster?.id],
        providerKeys: ["hacker-news"],
        citationIds: ["citation-hn"],
      }),
    ]);
    expect(JSON.stringify({ omitted, topicMap })).not.toContain(
      githubSentinel,
    );
  });
});

const githubSentinel = "GITHUB_ONLY_SENTINEL";

const fixtureSelection = (): SummaryEvidenceSelection =>
  ({
    rankingPolicyVersion: "story_ranking_v7",
    sourceWindow: {
      windowId: "window-1",
      startedAt: new Date("2026-07-19T00:00:00.000Z"),
      endedAt: new Date("2026-07-20T00:00:00.000Z"),
      selectedFeedItemIds: ["feed-hn", "feed-github"],
      storyClusterIds: ["cluster-mixed"],
    },
    clusters: [
      {
        id: `cluster-${githubSentinel}`,
        storyKey: `github-repo:${githubSentinel}`,
        rankingPolicyVersion: `ranking-${githubSentinel}`,
        representativeFeedItemId: "feed-github",
        duplicateFeedItemIds: ["feed-hn"],
        interestIds: [`interest-${githubSentinel}`, "interest-ai"],
        providerKeys: ["github-trending-page", "hacker-news"],
        score: 999,
        signalBreakdown: {
          baseScore: 999,
          crossProviderSupport: 999,
          sameProviderSupport: 999,
          providerDiversityBoost: 999,
          interestDiversityBoost: 999,
          freshnessBoost: 999,
          totalScore: 999,
        },
        observedAtRange: {
          startedAt: new Date("1999-01-01T00:00:00.000Z"),
          endedAt: new Date("2099-01-01T00:00:00.000Z"),
        },
        whyImportant: [`Boosted by ${githubSentinel}`],
      },
    ],
    selectedEvidence: [
      {
        feedItemId: "feed-hn",
        sourceItemId: "source-hn",
        sourceBindingId: "binding-hn",
        interestId: "interest-ai",
        providerKey: "hacker-news",
        canonicalUrl: "https://news.ycombinator.com/item?id=1",
        title: "Production monitoring runtime regression",
        bodyPreview:
          "Operators report a runtime regression in production monitoring.",
        publishedAt: new Date("2026-07-19T12:00:00.000Z"),
        observedAt: new Date("2026-07-19T12:01:00.000Z"),
        score: 1,
        whyImportant: ["Relevant HN story"],
      },
      {
        feedItemId: "feed-github",
        sourceItemId: "source-github",
        sourceBindingId: "binding-github",
        interestId: "interest-ai",
        providerKey: "github-trending-page",
        canonicalUrl: "https://github.com/owner/repo",
        title: "owner/repo",
        publishedAt: new Date("2026-07-19T12:00:00.000Z"),
        observedAt: new Date("2026-07-19T12:01:00.000Z"),
        score: 1,
        whyImportant: ["Trending repository"],
      },
    ],
  }) satisfies SummaryEvidenceSelection;
