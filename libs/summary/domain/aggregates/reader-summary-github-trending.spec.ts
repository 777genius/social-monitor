import { buildReaderSummary } from "./reader-summary";

describe("reader summary GitHub Trending projection", () => {
  it("keeps the exact Top 10 in selectedPosts and only breakouts in Watch", () => {
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
        citationIds: ["citation-12"],
      }),
    ]);
    expect(readerSummary.selectedPosts).toHaveLength(10);
    expect(readerSummary.selectedPosts?.map((post) => post.title)).toEqual([
      "calesthio/OpenMontage",
      ...Array.from(
        { length: 9 },
        (_, index) => `example/repository-${index + 2}`,
      ),
    ]);
  });
});
