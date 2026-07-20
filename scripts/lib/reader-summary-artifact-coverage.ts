export type ProviderSelectedCount = {
  readonly providerKey: string;
  readonly selectedFeedItemCount: number;
};

export type SelectedFeedItemCitation = {
  readonly feedItemId: string;
  readonly providerKey: string;
};

export type SelectedFeedItemProvenance = {
  readonly feedItemId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly interestTenantId: string | null;
  readonly interestWorkspaceId: string | null;
  readonly providerKey: string;
};

export type SelectedCoverageScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly summaryScope:
    | { readonly type: "workspace" }
    | { readonly type: "interest"; readonly interestId: string };
};

const primaryArticleProviderKeys = new Set([
  "reddit",
  "rss",
  "hacker-news",
  "x-twitter",
]);

export const isPrimaryReaderSummaryArticleProvider = (
  providerKey: string,
): boolean => {
  const normalized = normalizedProviderKey(providerKey);
  return (
    normalized !== undefined && primaryArticleProviderKeys.has(normalized)
  );
};

const isSupplementalReaderSummaryProvider = (providerKey: string): boolean =>
  normalizedProviderKey(providerKey) === "github-trending-page";

// The source window is the full scoped selection. The provider breakdown is
// the source-mix projection: unique primary feed items grouped by provider.
// Reader selectedPosts are identity-deduped and supplemental-display-capped,
// so they are intentionally not evidence for this invariant.
export const selectedCoverageMatchesProviderBreakdown = (
  coverage: {
    readonly selectedFeedItemCount: number;
    readonly providerBreakdown: readonly ProviderSelectedCount[];
  },
  evidence: {
    readonly selectedFeedItemIds: readonly string[];
    readonly citations: readonly SelectedFeedItemCitation[];
    readonly feedItems: readonly SelectedFeedItemProvenance[];
    readonly scope: SelectedCoverageScope;
  },
): boolean => {
  if (
    !validCount(coverage.selectedFeedItemCount) ||
    coverage.selectedFeedItemCount !== evidence.selectedFeedItemIds.length
  ) {
    return false;
  }

  const selectedFeedItemIds = normalizedUniqueIds(
    evidence.selectedFeedItemIds,
  );
  if (selectedFeedItemIds === undefined) {
    return false;
  }

  const selectedFeedItems = selectedFeedItemProvenanceById(
    selectedFeedItemIds,
    evidence.feedItems,
    evidence.scope,
  );
  if (selectedFeedItems === undefined) {
    return false;
  }

  const providerBySelectedFeedItemId = selectedCitationProviders(
    selectedFeedItemIds,
    evidence.citations,
  );
  if (providerBySelectedFeedItemId === undefined) {
    return false;
  }

  for (const [feedItemId, providerKey] of providerBySelectedFeedItemId) {
    if (selectedFeedItems.get(feedItemId)?.providerKey !== providerKey) {
      return false;
    }
  }

  const expectedPrimaryCounts = new Map<string, number>();
  for (const feedItem of selectedFeedItems.values()) {
    if (isSupplementalReaderSummaryProvider(feedItem.providerKey)) {
      continue;
    }
    if (!isPrimaryReaderSummaryArticleProvider(feedItem.providerKey)) {
      return false;
    }
    expectedPrimaryCounts.set(
      feedItem.providerKey,
      (expectedPrimaryCounts.get(feedItem.providerKey) ?? 0) + 1,
    );
  }

  const breakdownCounts = normalizedBreakdownCounts(
    coverage.providerBreakdown,
  );
  if (breakdownCounts === undefined) {
    return false;
  }

  for (const [providerKey, expectedCount] of expectedPrimaryCounts) {
    if (breakdownCounts.get(providerKey) !== expectedCount) {
      return false;
    }
  }

  return [...breakdownCounts].every(([providerKey, count]) => {
    if (isPrimaryReaderSummaryArticleProvider(providerKey)) {
      return count === (expectedPrimaryCounts.get(providerKey) ?? 0);
    }

    return isSupplementalReaderSummaryProvider(providerKey) && count === 0;
  });
};

export const selectedFeedItemProvenanceMatchesScope = (evidence: {
  readonly selectedFeedItemIds: readonly string[];
  readonly feedItems: readonly SelectedFeedItemProvenance[];
  readonly scope: SelectedCoverageScope;
}): boolean => {
  const selectedFeedItemIds = normalizedUniqueIds(
    evidence.selectedFeedItemIds,
  );
  return (
    selectedFeedItemIds !== undefined &&
    selectedFeedItemProvenanceById(
      selectedFeedItemIds,
      evidence.feedItems,
      evidence.scope,
    ) !== undefined
  );
};

const normalizedUniqueIds = (
  values: readonly string[],
): ReadonlySet<string> | undefined => {
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => value.length === 0)) {
    return undefined;
  }

  const unique = new Set(normalized);
  return unique.size === normalized.length ? unique : undefined;
};

const selectedFeedItemProvenanceById = (
  selectedFeedItemIds: ReadonlySet<string>,
  feedItems: readonly SelectedFeedItemProvenance[],
  scope: SelectedCoverageScope,
): ReadonlyMap<string, { readonly providerKey: string }> | undefined => {
  const expectedTenantId = normalizedId(scope.tenantId);
  const expectedWorkspaceId = normalizedId(scope.workspaceId);
  const expectedInterestId =
    scope.summaryScope.type === "interest"
      ? normalizedId(scope.summaryScope.interestId)
      : undefined;
  if (
    expectedTenantId === undefined ||
    expectedWorkspaceId === undefined ||
    (scope.summaryScope.type === "interest" &&
      expectedInterestId === undefined)
  ) {
    return undefined;
  }

  const provenanceByFeedItemId = new Map<
    string,
    { readonly providerKey: string }
  >();
  for (const feedItem of feedItems) {
    const feedItemId = normalizedId(feedItem.feedItemId);
    const tenantId = normalizedId(feedItem.tenantId);
    const workspaceId = normalizedId(feedItem.workspaceId);
    const interestId = normalizedId(feedItem.interestId);
    const interestTenantId = normalizedNullableId(feedItem.interestTenantId);
    const interestWorkspaceId = normalizedNullableId(
      feedItem.interestWorkspaceId,
    );
    const providerKey = normalizedProviderKey(feedItem.providerKey);
    if (
      feedItemId === undefined ||
      !selectedFeedItemIds.has(feedItemId) ||
      provenanceByFeedItemId.has(feedItemId) ||
      tenantId !== expectedTenantId ||
      workspaceId !== expectedWorkspaceId ||
      interestId === undefined ||
      interestTenantId !== expectedTenantId ||
      interestWorkspaceId !== expectedWorkspaceId ||
      (expectedInterestId !== undefined && interestId !== expectedInterestId) ||
      providerKey === undefined
    ) {
      return undefined;
    }
    provenanceByFeedItemId.set(feedItemId, { providerKey });
  }

  return provenanceByFeedItemId.size === selectedFeedItemIds.size
    ? provenanceByFeedItemId
    : undefined;
};

const selectedCitationProviders = (
  selectedFeedItemIds: ReadonlySet<string>,
  citations: readonly SelectedFeedItemCitation[],
): ReadonlyMap<string, string> | undefined => {
  const providerByFeedItemId = new Map<string, string>();
  for (const citation of citations) {
    const feedItemId = citation.feedItemId.trim();
    if (!selectedFeedItemIds.has(feedItemId)) {
      return undefined;
    }
    const providerKey = normalizedProviderKey(citation.providerKey);
    const current = providerByFeedItemId.get(feedItemId);
    if (
      providerKey === undefined ||
      (current !== undefined && current !== providerKey)
    ) {
      return undefined;
    }
    providerByFeedItemId.set(feedItemId, providerKey);
  }

  return providerByFeedItemId;
};

const normalizedBreakdownCounts = (
  breakdown: readonly ProviderSelectedCount[],
): ReadonlyMap<string, number> | undefined => {
  const counts = new Map<string, number>();
  for (const provider of breakdown) {
    const providerKey = normalizedProviderKey(provider.providerKey);
    if (
      providerKey === undefined ||
      !validCount(provider.selectedFeedItemCount) ||
      counts.has(providerKey)
    ) {
      return undefined;
    }
    counts.set(providerKey, provider.selectedFeedItemCount);
  }

  return counts;
};

const normalizedProviderKey = (value: string): string | undefined => {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return normalized.length > 0 ? normalized : undefined;
};

const normalizedId = (value: string): string | undefined => {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizedNullableId = (value: string | null): string | undefined =>
  value === null ? undefined : normalizedId(value);

const validCount = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;
