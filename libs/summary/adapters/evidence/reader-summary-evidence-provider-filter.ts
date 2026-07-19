const defaultExcludedReaderSummaryProviders = new Set(["github-issues"]);

export const isDefaultReaderSummaryEvidenceProvider = (
  providerKey: string,
): boolean =>
  !defaultExcludedReaderSummaryProviders.has(providerKey.toLowerCase());
