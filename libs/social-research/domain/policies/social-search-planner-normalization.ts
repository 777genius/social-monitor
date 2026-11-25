import type {
  NormalizedSocialAccountRef,
  NormalizedSocialCommunityRef,
  SocialAccountRef,
  SocialCommunityListing,
  SocialCommunityRef,
} from '../value-objects/social-search-intent';

export const normalizeAccounts = (
  handles: readonly SocialAccountRef[],
): readonly NormalizedSocialAccountRef[] =>
  compactUniqueBy(
    handles
      .map((handle) =>
        typeof handle === 'string'
          ? {
              handle: normalizeHandle(handle),
              includePosts: true,
              includeMentions: true,
            }
          : {
              handle: normalizeHandle(handle.handle),
              sourceKey: handle.sourceKey,
              includePosts: handle.includePosts ?? true,
              includeMentions: handle.includeMentions ?? true,
            },
      )
      .filter((handle) => handle.handle.length > 0),
    (handle) => `${handle.sourceKey ?? '*'}:${handle.handle}`,
  );

export const normalizeCommunities = (
  communities: readonly SocialCommunityRef[],
): readonly NormalizedSocialCommunityRef[] =>
  compactUniqueBy(
    communities
      .map((community) =>
        typeof community === 'string'
          ? {
              name: normalizeCommunityName(community),
              listings: defaultCommunityListings,
            }
          : {
              name: normalizeCommunityName(community.name),
              sourceKey: community.sourceKey,
              listings:
                community.listings?.length === undefined ||
                community.listings.length === 0
                  ? defaultCommunityListings
                  : compactUnique(community.listings),
            },
      )
      .filter((community) => community.name.length > 0),
    (community) => `${community.sourceKey ?? '*'}:${community.name}`,
  );

export const normalizeQueryText = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

export const buildFallbackQuery = (
  topic: string,
  products: readonly string[],
  keywords: readonly string[],
): string | undefined => {
  const tokens = compactUnique([
    ...topicTokens(topic),
    ...products.flatMap(topicTokens),
    ...keywords.flatMap(topicTokens),
  ]).slice(0, 4);

  return tokens.length === 0 ? undefined : tokens.join(' ');
};

export const compactUnique = <T extends string>(
  values: readonly T[],
): readonly T[] => [...new Set(values.filter((value) => value.length > 0))];

export const compactUniqueBy = <T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): readonly T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
};

const defaultCommunityListings = [
  'top',
  'hot',
  'new',
] satisfies readonly SocialCommunityListing[];

const normalizeHandle = (value: string): string =>
  value.trim().replace(/^@/, '').replace(/\s+/g, '').toLowerCase();

const normalizeCommunityName = (value: string): string =>
  value.trim().replace(/^r\//i, '').replace(/\s+/g, '').toLowerCase();

const topicTokens = (value: string): readonly string[] =>
  value
    .toLowerCase()
    .replace(/["()]/g, ' ')
    .split(/[^a-z0-9+#.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.toLowerCase() !== 'the');
