export type GitHubTrendingPageWindow = 'daily' | 'weekly' | 'monthly';

export const redditProviderSourceKey = (
  subreddit: string | undefined,
): string =>
  subreddit === undefined
    ? 'reddit:unknown'
    : `r/${normalizeSourceSegment(subreddit)}`;

export const githubRepositoryProviderSourceKey = (params: {
  readonly primaryWindow: string;
  readonly query?: string;
  readonly languages: readonly string[];
  readonly fallbackLanguage?: string;
  readonly topics: readonly string[];
  readonly fallbackTopics: readonly string[];
}): string =>
  [
    'repo-trending',
    normalizeSourceSegment(params.primaryWindow),
    'query',
    querySourceBucket(params.query),
    'language',
    githubRepositoryLanguageBucket(params.languages, params.fallbackLanguage),
    'topic',
    githubRepositoryTopicBucket(
      params.topics.length === 0 ? params.fallbackTopics : params.topics,
    ),
  ].join(':');

export const githubTrendingPageProviderSourceKey = (params: {
  readonly window: GitHubTrendingPageWindow;
  readonly programmingLanguage?: string;
  readonly spokenLanguage?: string;
}): string =>
  [
    'github-trending-page',
    normalizeSourceSegment(params.window),
    'language',
    normalizeSourceSegment(params.programmingLanguage ?? 'any'),
    ...(params.spokenLanguage === undefined
      ? []
      : ['spoken-language', normalizeSourceSegment(params.spokenLanguage)]),
  ].join(':');

export const hackerNewsProviderSourceKey = (
  source: string | undefined,
): string => `hn:${normalizeSourceSegment(source ?? 'unknown')}`;

export const xProviderSourceKey = (params: {
  readonly account?: string;
  readonly topic?: string;
  readonly searchQuery?: string;
}): string => {
  if (params.account !== undefined) {
    return `account:${normalizeSourceSegment(params.account)}`;
  }

  if (params.topic !== undefined) {
    return `topic:${normalizeSourceSegment(params.topic)}`;
  }

  return params.searchQuery === undefined
    ? 'x:unknown'
    : `search:${querySourceBucket(params.searchQuery)}`;
};

const githubRepositoryLanguageBucket = (
  languages: readonly string[],
  fallbackLanguage?: string,
): string => {
  const normalizedLanguages = languages
    .map((language) => normalizeSourceSegment(language))
    .filter((language) => language !== 'unknown')
    .sort((left, right) => left.localeCompare(right, 'en-US'));

  if (normalizedLanguages.length > 0) {
    return normalizedLanguages.slice(0, 2).join('+');
  }

  return normalizeSourceSegment(fallbackLanguage ?? 'unknown');
};

const githubRepositoryTopicBucket = (topics: readonly string[]): string => {
  const normalizedTopics = topics
    .map((topic) => normalizeSourceSegment(topic))
    .filter((topic) => topic !== 'unknown')
    .sort((left, right) => left.localeCompare(right, 'en-US'));

  return normalizedTopics.length === 0
    ? 'unknown'
    : normalizedTopics.slice(0, 2).join('+');
};

const querySourceBucket = (query: string | undefined): string => {
  const normalized = normalizeSourceSegment(query ?? '');

  return normalized === 'unknown'
    ? 'any'
    : `q_${stableSourceFingerprint(normalized)}`;
};

const stableSourceFingerprint = (value: string): string => {
  let hash = 0xcbf29ce484222325n;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }

  return hash.toString(36).padStart(13, '0');
};

const normalizeSourceSegment = (value: string): string => {
  const normalized = value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9._+-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');

  return normalized.length === 0 ? 'unknown' : normalized;
};
