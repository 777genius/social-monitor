const defaultExcludedReaderSummaryProviders = new Set([
  "github-issues",
  "github-trending-page",
]);

export const isDefaultReaderSummaryEvidenceProvider = (
  providerKey: string,
): boolean =>
  !defaultExcludedReaderSummaryProviders.has(providerKey.toLowerCase());
