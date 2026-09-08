// Pure E2 policy extracted from reviewed b8ad; structural inputs keep adapters outside domain.
type XExperimentalDailyScanConfig = Readonly<{
  maxItemsBySearchQuery: ReadonlyMap<string, number>;
  maxItemsPerQuery: number;
}>;
type AdaptivePaginationPolicy = Readonly<{ targetItems: number }>;

// Budgets constrain collector requests and describe normalization; they do not
// truncate returned posts. Collector scoring/capping has already happened.
export const resolveXQueryBudget = (
  config: XExperimentalDailyScanConfig, searchQuery: string,
): number => config.maxItemsBySearchQuery.get(searchQuery) ?? config.maxItemsPerQuery;

export const resolveXQueryTarget = (
  queryMaxItems: number, queryCount: number,
  paginationPolicy: AdaptivePaginationPolicy | undefined,
): number => paginationPolicy === undefined ? queryMaxItems : Math.max(
  queryMaxItems, Math.ceil(paginationPolicy.targetItems / Math.max(queryCount, 1)),
);
