import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';

export type FeedDedupeInput = {
  readonly canonicalUrl: string;
  readonly providerMetadata?: JsonObject;
};

export const feedDedupeKeyForItem = (input: FeedDedupeInput): string => {
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
