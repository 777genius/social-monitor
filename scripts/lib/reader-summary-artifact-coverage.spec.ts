import {
  isPrimaryReaderSummaryArticleProvider,
  selectedCoverageMatchesProviderBreakdown,
  selectedFeedItemProvenanceMatchesScope,
  type SelectedCoverageScope,
  type SelectedFeedItemCitation,
  type SelectedFeedItemProvenance,
} from "./reader-summary-artifact-coverage";

describe("selectedCoverageMatchesProviderBreakdown", () => {
  it("accepts the real 131 selected / 129 projected / 120 primary-provider case", () => {
    const fixture = productionRegressionFixture();

    expect(fixture.coverage.selectedFeedItemCount).toBe(131);
    expect(fixture.selectedPosts).toHaveLength(129);
    expect(
      fixture.coverage.providerBreakdown.reduce(
        (sum, provider) => sum + provider.selectedFeedItemCount,
        0,
      ),
    ).toBe(120);
    expect(matches(fixture)).toBe(true);
  });

  it("fails closed when a primary provider count is understated", () => {
    const fixture = productionRegressionFixture();

    expect(
      matches({
        ...fixture,
        coverage: {
          ...fixture.coverage,
          providerBreakdown: fixture.coverage.providerBreakdown.map(
            (provider) =>
              provider.providerKey === "reddit"
                ? { ...provider, selectedFeedItemCount: 29 }
                : provider,
          ),
        },
      }),
    ).toBe(false);
  });

  it("fails closed when supplemental evidence is counted as primary", () => {
    const fixture = productionRegressionFixture();

    expect(
      matches({
        ...fixture,
        coverage: {
          ...fixture.coverage,
          providerBreakdown: fixture.coverage.providerBreakdown.map(
            (provider) =>
              provider.providerKey === "github-trending-page"
                ? { ...provider, selectedFeedItemCount: 11 }
                : provider,
          ),
        },
      }),
    ).toBe(false);
  });

  it("fails closed for an unknown zero-count breakdown provider", () => {
    const fixture = singleRedditFixture();

    expect(
      matches({
        ...fixture,
        coverage: {
          ...fixture.coverage,
          providerBreakdown: [
            ...fixture.coverage.providerBreakdown,
            { providerKey: "github-issues", selectedFeedItemCount: 0 },
          ],
        },
      }),
    ).toBe(false);
  });

  it("accepts the explicit zero-count supplemental breakdown provider", () => {
    const fixture = singleRedditFixture();

    expect(
      matches({
        ...fixture,
        coverage: {
          ...fixture.coverage,
          providerBreakdown: [
            ...fixture.coverage.providerBreakdown,
            {
              providerKey: "github-trending-page",
              selectedFeedItemCount: 0,
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("rejects self-consistent GitHub Issues citations and source-mix counts", () => {
    const fixture = productionRegressionFixture();
    const githubIssuesId = fixture.selectedFeedItemIds.at(-1)!;

    expect(
      matches({
        ...fixture,
        coverage: {
          ...fixture.coverage,
          providerBreakdown: [
            ...fixture.coverage.providerBreakdown,
            { providerKey: "github-issues", selectedFeedItemCount: 1 },
          ],
        },
        citations: fixture.citations.map((citation) =>
          citation.feedItemId === githubIssuesId
            ? { ...citation, providerKey: "github-issues" }
            : citation,
        ),
        feedItems: fixture.feedItems.map((feedItem) =>
          feedItem.feedItemId === githubIssuesId
            ? { ...feedItem, providerKey: "github-issues" }
            : feedItem,
        ),
      }),
    ).toBe(false);
    expect(isPrimaryReaderSummaryArticleProvider("github-issues")).toBe(
      false,
    );
  });

  it("uses DB selection provenance rather than requiring display citations", () => {
    const fixture = productionRegressionFixture();

    expect(
      matches({ ...fixture, citations: fixture.citations.slice(0, -1) }),
    ).toBe(true);
  });

  it("fails closed when a citation references outside the selected window", () => {
    const fixture = productionRegressionFixture();

    expect(
      matches({
        ...fixture,
        citations: [
          ...fixture.citations,
          { feedItemId: "outside-selection", providerKey: "reddit" },
        ],
      }),
    ).toBe(false);
  });

  it("fails closed when one selected item maps to conflicting providers", () => {
    const fixture = productionRegressionFixture();
    const selectedFeedItemId = fixture.selectedFeedItemIds[0]!;

    expect(
      matches({
        ...fixture,
        citations: [
          ...fixture.citations,
          { feedItemId: selectedFeedItemId, providerKey: "rss" },
        ],
      }),
    ).toBe(false);
  });

  it("fails closed when citation and DB provider provenance disagree", () => {
    const fixture = productionRegressionFixture();

    expect(
      matches({
        ...fixture,
        citations: fixture.citations.map((citation, index) =>
          index === 0 ? { ...citation, providerKey: "rss" } : citation,
        ),
      }),
    ).toBe(false);
  });

  it("fails closed on missing or duplicate DB provenance", () => {
    const fixture = productionRegressionFixture();

    expect(
      matches({ ...fixture, feedItems: fixture.feedItems.slice(0, -1) }),
    ).toBe(false);
    expect(
      matches({
        ...fixture,
        feedItems: [...fixture.feedItems, fixture.feedItems[0]!],
      }),
    ).toBe(false);
  });

  it("fails closed on cross-tenant or cross-workspace DB provenance", () => {
    const fixture = productionRegressionFixture();

    const crossTenant = {
      ...fixture,
      feedItems: fixture.feedItems.map((feedItem, index) =>
        index === 0 ? { ...feedItem, tenantId: "tenant-other" } : feedItem,
      ),
    };
    const crossWorkspace = {
      ...fixture,
      feedItems: fixture.feedItems.map((feedItem, index) =>
        index === 0
          ? { ...feedItem, workspaceId: "workspace-other" }
          : feedItem,
      ),
    };

    expect(provenanceMatches(crossTenant)).toBe(false);
    expect(matches(crossTenant)).toBe(false);
    expect(provenanceMatches(crossWorkspace)).toBe(false);
    expect(matches(crossWorkspace)).toBe(false);
  });

  it("fails closed when interest provenance is missing or cross-scoped", () => {
    const fixture = productionRegressionFixture();

    const missingInterest = {
      ...fixture,
      feedItems: fixture.feedItems.map((feedItem, index) =>
        index === 0 ? { ...feedItem, interestTenantId: null } : feedItem,
      ),
    };
    const crossScopeInterest = {
      ...fixture,
      feedItems: fixture.feedItems.map((feedItem, index) =>
        index === 0
          ? { ...feedItem, interestWorkspaceId: "workspace-other" }
          : feedItem,
      ),
    };

    expect(provenanceMatches(missingInterest)).toBe(false);
    expect(matches(missingInterest)).toBe(false);
    expect(provenanceMatches(crossScopeInterest)).toBe(false);
    expect(matches(crossScopeInterest)).toBe(false);
  });

  it("fails closed when an interest-scoped selection contains another interest", () => {
    const fixture = productionRegressionFixture();

    const crossInterest = {
      ...fixture,
      scope: {
        ...fixture.scope,
        summaryScope: {
          type: "interest" as const,
          interestId: "interest-ai",
        },
      },
      feedItems: fixture.feedItems.map((feedItem, index) => ({
        ...feedItem,
        interestId: index === 0 ? "interest-other" : "interest-ai",
      })),
    };

    expect(provenanceMatches(crossInterest)).toBe(false);
    expect(matches(crossInterest)).toBe(false);
  });

  it("fails closed for duplicate source-window ids or a false selected total", () => {
    const fixture = productionRegressionFixture();

    expect(
      matches({
        ...fixture,
        selectedFeedItemIds: [
          ...fixture.selectedFeedItemIds.slice(0, -1),
          fixture.selectedFeedItemIds[0]!,
        ],
      }),
    ).toBe(false);
    expect(
      matches({
        ...fixture,
        coverage: { ...fixture.coverage, selectedFeedItemCount: 130 },
      }),
    ).toBe(false);
  });
});

type CoverageFixture = {
  readonly coverage: Parameters<
    typeof selectedCoverageMatchesProviderBreakdown
  >[0];
  readonly selectedFeedItemIds: readonly string[];
  readonly citations: readonly SelectedFeedItemCitation[];
  readonly feedItems: readonly SelectedFeedItemProvenance[];
  readonly scope: SelectedCoverageScope;
  readonly selectedPosts: readonly string[];
};

const matches = (fixture: CoverageFixture): boolean =>
  selectedCoverageMatchesProviderBreakdown(fixture.coverage, {
    selectedFeedItemIds: fixture.selectedFeedItemIds,
    citations: fixture.citations,
    feedItems: fixture.feedItems,
    scope: fixture.scope,
  });

const provenanceMatches = (fixture: CoverageFixture): boolean =>
  selectedFeedItemProvenanceMatchesScope({
    selectedFeedItemIds: fixture.selectedFeedItemIds,
    feedItems: fixture.feedItems,
    scope: fixture.scope,
  });

function singleRedditFixture(): CoverageFixture {
  const citation: SelectedFeedItemCitation = {
    feedItemId: "reddit-1",
    providerKey: "reddit",
  };

  return {
    coverage: {
      selectedFeedItemCount: 1,
      providerBreakdown: [
        { providerKey: "reddit", selectedFeedItemCount: 1 },
      ],
    },
    selectedFeedItemIds: [citation.feedItemId],
    citations: [citation],
    feedItems: [
      {
        feedItemId: citation.feedItemId,
        tenantId: "tenant-main",
        workspaceId: "workspace-main",
        interestId: "interest-ai",
        interestTenantId: "tenant-main",
        interestWorkspaceId: "workspace-main",
        providerKey: citation.providerKey,
      },
    ],
    scope: {
      tenantId: "tenant-main",
      workspaceId: "workspace-main",
      summaryScope: { type: "workspace" },
    },
    selectedPosts: ["post-1"],
  };
}

function productionRegressionFixture(): CoverageFixture {
  const primaryProviders = [
    "reddit",
    "x-twitter",
    "hacker-news",
    "rss",
  ] as const;
  const primaryCitations = primaryProviders.flatMap((providerKey) =>
    Array.from(
      { length: 30 },
      (_, index): SelectedFeedItemCitation => ({
        feedItemId: `${providerKey}-${index + 1}`,
        providerKey,
      }),
    ),
  );
  const supplementalCitations = Array.from(
    { length: 11 },
    (_, index): SelectedFeedItemCitation => ({
      feedItemId: `github-trending-page-${index + 1}`,
      providerKey: "github-trending-page",
    }),
  );
  const citations = [...primaryCitations, ...supplementalCitations];
  const feedItems = citations.map(
    (citation): SelectedFeedItemProvenance => ({
      feedItemId: citation.feedItemId,
      tenantId: "tenant-main",
      workspaceId: "workspace-main",
      interestId: "interest-ai",
      interestTenantId: "tenant-main",
      interestWorkspaceId: "workspace-main",
      providerKey: citation.providerKey,
    }),
  );

  return {
    coverage: {
      selectedFeedItemCount: 131,
      providerBreakdown: [
        ...primaryProviders.map((providerKey) => ({
          providerKey,
          selectedFeedItemCount: 30,
        })),
        {
          providerKey: "github-trending-page",
          selectedFeedItemCount: 0,
        },
      ],
    },
    selectedFeedItemIds: citations.map((citation) => citation.feedItemId),
    citations,
    feedItems,
    scope: {
      tenantId: "tenant-main",
      workspaceId: "workspace-main",
      summaryScope: { type: "workspace" as const },
    },
    // One primary canonical identity is collapsed and only the GitHub Top 10
    // is projected; neither presentation rule changes selection provenance.
    selectedPosts: Array.from({ length: 129 }, (_, index) => `post-${index}`),
  };
}
