import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';

export type FeedDedupeInput = {
  readonly canonicalUrl: string;
  readonly sourceBindingId?: string;
  readonly providerMetadata?: JsonObject;
};

export const feedDedupeKeyForItem = (input: FeedDedupeInput): string => {
  const githubTrendingKey = githubTrendingDailyDedupeKey(input);
  if (githubTrendingKey !== undefined) {
    return githubTrendingKey;
  }

  const semanticFingerprint = readNestedString(input.providerMetadata, ['articleContent', 'semanticFingerprint']);
  if (semanticFingerprint !== undefined) {
    return `article:${semanticFingerprint}`;
  }

  const contentHash = readNestedString(input.providerMetadata, ['articleContent', 'contentHash']);
  if (contentHash !== undefined) {
    return `article-content:${contentHash}`;
  }

  return normalizeFeedCanonicalUrl(input.canonicalUrl);
};

const githubTrendingDailyDedupeKey = (
  input: FeedDedupeInput,
): string | undefined => {
  if (input.providerMetadata?.kind !== "github_trending_page_repository") {
    return undefined;
  }

  const checkedAt = readNestedString(input.providerMetadata, [
    "trending",
    "checkedAt",
  ]);
  const window = readNestedString(input.providerMetadata, [
    "trending",
    "window",
  ]);
  const repository = readNestedString(input.providerMetadata, [
    "repository",
    "fullName",
  ]);
  if (
    checkedAt === undefined ||
    window === undefined ||
    repository === undefined ||
    input.sourceBindingId === undefined ||
    input.sourceBindingId.trim().length === 0 ||
    !["daily", "weekly", "monthly"].includes(window)
  ) {
    return undefined;
  }

  const timestamp = new Date(checkedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return undefined;
  }

  return `github-trending:${input.sourceBindingId.trim()}:${window}:${timestamp.toISOString().slice(0, 10)}:${repository.toLocaleLowerCase("en-US")}`;
};

export const normalizeFeedCanonicalUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLocaleLowerCase('en-US');

    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLocaleLowerCase('en-US').startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
        parsed.searchParams.delete(key);
      }
    }

    parsed.searchParams.sort();

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
    }

    return parsed.toString();
  } catch {
    return value.trim().toLocaleLowerCase('en-US');
  }
};

const readNestedString = (metadata: JsonObject | undefined, path: readonly string[]): string | undefined => {
  let current: JsonValue | undefined = metadata;

  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Readonly<Record<string, JsonValue>>)[key];
  }

  return typeof current === 'string' && current.trim().length > 0 ? current.trim() : undefined;
};
