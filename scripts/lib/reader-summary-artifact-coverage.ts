export type ProviderSelectedCount = {
  readonly providerKey: string;
  readonly selectedFeedItemCount: number;
};

export const selectedCoverageMatchesProviderBreakdown = (
  coverage: {
    readonly selectedFeedItemCount: number;
    readonly providerBreakdown: readonly ProviderSelectedCount[];
  },
  selectedPosts: readonly { readonly providerKey: string }[],
): boolean => {
  const providerSelectedCount = coverage.providerBreakdown.reduce(
    (sum, provider) => sum + provider.selectedFeedItemCount,
    0,
  );
  const githubTrendingProviderCount =
    coverage.providerBreakdown.find(
      (provider) => provider.providerKey === "github-trending-page",
    )?.selectedFeedItemCount ?? 0;
  const githubTrendingSelectedPostCount = selectedPosts.filter(
    (post) => post.providerKey === "github-trending-page",
  ).length;
  const appendixOnlyCount = Math.max(
    0,
    githubTrendingSelectedPostCount - githubTrendingProviderCount,
  );

  return (
    coverage.selectedFeedItemCount === providerSelectedCount + appendixOnlyCount
  );
};
