import {
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  parseGitHubTrendingPageRepositoryMetadata,
  type SourceItemProps,
} from '../../domain';

/** Match legacy case-preserving and current canonical IDs for one observation. */
export const sourceItemIdentityCandidates = (
  providerKey: string,
  item: SourceItemProps,
): readonly string[] => {
  if (providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY) return [item.externalId];
  const metadata = parseGitHubTrendingPageRepositoryMetadata(item.metadata);
  if (metadata === null) return [item.externalId];
  const prefix = `${GITHUB_TRENDING_PAGE_PROVIDER_KEY}:${metadata.trending.window}:${metadata.trending.scanJobId}:`;
  return [...new Set([item.externalId, `${prefix}${metadata.repository.fullName}`,
    `${prefix}${metadata.repository.fullName.toLocaleLowerCase('en-US')}`])];
};

/** Preserve the exact scan identity while matching repository names case-insensitively. */
export const sourceItemIdentityKey = (providerKey: string, externalId: string): string => {
  if (providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY) return externalId;
  const separator = externalId.lastIndexOf(':');
  if (separator < 0) return externalId;
  return externalId.slice(0, separator + 1) + externalId.slice(separator + 1).toLocaleLowerCase('en-US');
};
