import { buildReaderSummary } from "./reader-summary";

describe("reader summary GitHub Trending projection", () => {
  it("materializes the canonical GitHub Trending Top 10 without promoting it to editorial lanes", () => {
    const ranks = [...Array.from({ length: 10 }, (_, index) => index + 1), 12];
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
          interestIds: ["ai-developer-tools"],
          providerKeys: ["github-trending-page"],
          citationIds: ["citation-1"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: ranks.map((rank) => ({
        citationId: `citation-${rank}`,
        feedItemId: `feed-${rank}`,
        sourceItemId: `source-${rank}`,
        providerKey: "github-trending-page",
        field: "title" as const,
        canonicalUrl:
          rank === 1
            ? "https://github.com/calesthio/OpenMontage"
            : `https://github.com/example/repository-${rank}`,
      })),
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "github-trending:calesthio/OpenMontage",
          representativeFeedItemId: "feed-1",
          duplicateFeedItemIds: [],
          interestIds: ["ai-developer-tools"],
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
      selectedEvidence: ranks.map((rank, index) => {
        const title =
          rank === 1 ? "calesthio/OpenMontage" : `example/repository-${rank}`;
        return {
          feedItemId: `feed-${rank}`,
          sourceItemId: `source-${rank}`,
          sourceBindingId: "binding-trending",
          interestId: "ai-developer-tools",
          providerKey: "github-trending-page",
          providerName: "GitHub Trending",
          canonicalUrl: `https://github.com/${title}`,
          title,
          publishedAt: new Date("2026-06-24T08:00:00.000Z"),
          observedAt: new Date("2026-06-24T09:00:00.000Z"),
          score: 1.5 - index / 100,
          readerActionKind: "watch_repository" as const,
          whyImportant: [
            `Repository is ranked #${rank} on the GitHub Trending page.`,
          ],
          providerMetricSummary: `#${rank}, +${3_703 - index} stars today`,
          providerMetricLabels: [
            {
              label: "GitHub Trending today",
              value: `#${rank}, +${3_703 - index} stars today`,
            },
            { label: "Stars", value: "18,398" },
            { label: "Forks", value: "2,113" },
          ],
        };
      }),
      qualityFlags: [],
    });

    expect(readerSummary.sourceMix).toEqual([]);
    expect(readerSummary.topReads).toEqual([]);
    expect(readerSummary.headline).toBe("No reliable workspace signal yet");
    expect(readerSummary.headline).not.toContain("GitHub");
    expect(readerSummary.qualityState.flags).toContain("no_signal");
    expect(readerSummary.narrativeSections).toEqual([
      expect.objectContaining({
        id: "github-trending",
        kind: "watch",
        citationIds: ["citation-1", "citation-2", "citation-3"],
      }),
    ]);
    expect(readerSummary.selectedPosts).toHaveLength(10);
    expect(readerSummary.selectedPosts.map((post) => post.title)).toEqual(
      Array.from({ length: 10 }, (_, index) =>
        index === 0
          ? "calesthio/OpenMontage"
          : `example/repository-${index + 1}`,
      ),
    );
  });

  it("removes authored Watch evidence outside the canonical Top 10", () => {
    const readerSummary = buildReaderSummary({
      headline: "Developers discuss a safer agent runtime",
      executiveSummary:
        "A Reddit discussion describes practical isolation controls for coding agents.",
      narrativeSections: [
        {
          id: "lead",
          kind: "lead",
          title: "Safer agent runtime",
          text: "Developers are testing stronger isolation controls for coding agents.",
          citationIds: ["citation-primary"],
          storyClusterId: "cluster-primary",
        },
        {
          id: "authored-github-watch",
          kind: "watch",
          title: "GitHub Trending",
          text: "A breakout repository gained attention on GitHub Trending.",
          citationIds: ["citation-github"],
        },
      ],
      topStories: [
        {
          storyClusterId: "cluster-primary",
          title: "Developers test stronger coding-agent isolation",
          summary:
            "A Reddit discussion describes practical isolation controls for coding agents.",
          interestIds: ["ai-developer-tools"],
          providerKeys: ["reddit"],
          citationIds: ["citation-primary"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-primary",
          feedItemId: "feed-primary",
          sourceItemId: "source-primary",
          providerKey: "reddit",
          field: "title",
          canonicalUrl: "https://reddit.example/r/agents/comments/1",
        },
        {
          citationId: "citation-github",
          feedItemId: "feed-github",
          sourceItemId: "source-github",
          providerKey: "github-trending-page",
          field: "title",
          canonicalUrl: "https://github.com/example/agent-runtime",
        },
      ],
      storyClusters: [
        {
          id: "cluster-primary",
          storyKey: "reddit:agent-runtime-isolation",
          representativeFeedItemId: "feed-primary",
          duplicateFeedItemIds: [],
          interestIds: ["ai-developer-tools"],
          providerKeys: ["reddit"],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date("2026-07-19T08:00:00.000Z"),
            endedAt: new Date("2026-07-19T09:00:00.000Z"),
          },
          whyImportant: ["Agent isolation reduces local security risk."],
        },
      ],
      sourceWindow: {
        windowId: "github-trending-filter-window",
        startedAt: new Date("2026-07-19T00:00:00.000Z"),
        endedAt: new Date("2026-07-20T00:00:00.000Z"),
        periodStartedAt: new Date("2026-07-19T00:00:00.000Z"),
        periodEndedAt: new Date("2026-07-20T00:00:00.000Z"),
        ingestionCutoff: new Date("2026-07-20T00:00:00.000Z"),
        selectedFeedItemIds: ["feed-primary", "feed-github"],
        storyClusterIds: ["cluster-primary"],
      },
      selectedEvidence: [
        {
          feedItemId: "feed-primary",
          sourceItemId: "source-primary",
          sourceBindingId: "binding-reddit",
          interestId: "ai-developer-tools",
          providerKey: "reddit",
          providerName: "Reddit",
          canonicalUrl: "https://reddit.example/r/agents/comments/1",
          title: "Developers test stronger coding-agent isolation",
          publishedAt: new Date("2026-07-19T08:00:00.000Z"),
          observedAt: new Date("2026-07-19T09:00:00.000Z"),
          score: 2.4,
          whyImportant: ["Agent isolation reduces local security risk."],
          providerMetricLabels: [{ label: "Score", value: "50" }],
          contentQuality: {
            qualityScore: 0.9,
            interestRelevanceScore: 0.9,
            engagementIntegrityScore: 0.9,
            eligibleForSummary: true,
            eligibleForTopRead: true,
            needsLlmReview: false,
            decision: "eligible",
            flags: [],
            reason: "Eligible production promotion fixture.",
          },
          promotionFacts: {
            contentKind: "original_post",
            canonicalIdentity: "story:agent-runtime-isolation",
            officialAccount: false,
            trustedAuthor: false,
            safetyValid: true,
            freshnessValid: true,
            freshnessProvenance: {
              status: "observed",
              publishedAt: new Date("2026-07-19T08:00:00.000Z"),
              observedAt: new Date("2026-07-19T09:00:00.000Z"),
              ingestionCutoff: new Date("2026-07-20T00:00:00.000Z"),
            },
            metrics: {
              provider: "reddit",
              score: 50,
              upvoteRatio: 0.6,
            },
          },
        },
        {
          feedItemId: "feed-github",
          sourceItemId: "source-github",
          sourceBindingId: "binding-github",
          interestId: "ai-developer-tools",
          providerKey: "github-trending-page",
          providerName: "GitHub Trending",
          canonicalUrl: "https://github.com/example/agent-runtime",
          title: "example/agent-runtime",
          publishedAt: new Date("2026-07-19T08:00:00.000Z"),
          observedAt: new Date("2026-07-19T09:00:00.000Z"),
          score: 1.9,
          whyImportant: ["Repository is ranked #12 on GitHub Trending."],
          providerMetricLabels: [
            {
              label: "GitHub Trending today",
              value: "#12, +1,201 stars today",
            },
          ],
        },
      ],
      qualityFlags: [],
    });

    expect(readerSummary.narrativeSections).toEqual([
      expect.objectContaining({
        id: "lead",
        citationIds: ["citation-primary"],
      }),
    ]);
    expect(readerSummary.claimBoard).toEqual([
      expect.objectContaining({
        id: "lead",
        citationIds: ["citation-primary"],
      }),
    ]);
    expect(
      readerSummary.claimBoard.flatMap((claim) => claim.citationIds),
    ).not.toContain("citation-github");
  });
});
