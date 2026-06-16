import type {
  SourceBindingConfig,
  SourceBindingConfigValidationResult,
  SourceCapabilityProfile,
  SourceCatalogPort,
} from '../../ports';

const fakeSourceProfile: SourceCapabilityProfile = {
  providerKey: 'fake-source',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const hackerNewsProfile: SourceCapabilityProfile = {
  providerKey: 'hacker-news',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const rssProfile: SourceCapabilityProfile = {
  providerKey: 'rss',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const redditProfile: SourceCapabilityProfile = {
  providerKey: 'reddit',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const sourceProfiles = new Map([
  [fakeSourceProfile.providerKey, fakeSourceProfile],
  [hackerNewsProfile.providerKey, hackerNewsProfile],
  [rssProfile.providerKey, rssProfile],
  [redditProfile.providerKey, redditProfile],
]);

export class FakeSourceCatalogAdapter implements SourceCatalogPort {
  async getCapability(providerKey: string): Promise<SourceCapabilityProfile | null> {
    return sourceProfiles.get(providerKey) ?? null;
  }

  async validateBindingConfig(
    providerKey: string,
    config: SourceBindingConfig,
  ): Promise<SourceBindingConfigValidationResult> {
    if (!sourceProfiles.has(providerKey)) {
      return { ok: false, reason: `Unknown source provider: ${providerKey}` };
    }

    if (providerKey === 'rss') {
      const feedUrl = firstNonEmptyString(config.feedUrl, config.url, config.query);

      if (feedUrl === undefined) {
        return { ok: false, reason: 'RSS source requires feedUrl, url or query.' };
      }

      return validateFeedUrl(feedUrl);
    }

    if (providerKey === 'hacker-news') {
      const mode = firstNonEmptyString(config.mode) ?? 'search';

      if (mode !== 'search' && mode !== 'listing') {
        return { ok: false, reason: `Unsupported Hacker News query mode: ${mode}` };
      }

      if (mode === 'listing') {
        const listing = firstNonEmptyString(config.listing, config.query) ?? 'top';

        return supportedHackerNewsListings.has(listing)
          ? { ok: true }
          : { ok: false, reason: `Unsupported Hacker News listing: ${listing}` };
      }

      return firstNonEmptyString(config.query, config.term) === undefined
        ? { ok: false, reason: 'Hacker News search source requires query or term.' }
        : { ok: true };
    }

    if (providerKey === 'reddit') {
      const mode = firstNonEmptyString(config.mode) ?? 'search';
      const accessToken = firstNonEmptyString(config.accessToken, config.apiToken, config.bearerToken);

      if (accessToken === undefined) {
        return { ok: false, reason: 'Reddit source requires accessToken, apiToken or bearerToken.' };
      }

      if (mode !== 'search' && mode !== 'listing') {
        return { ok: false, reason: `Unsupported Reddit query mode: ${mode}` };
      }

      if (mode === 'listing') {
        const subreddit = normalizeSubreddit(firstNonEmptyString(config.subreddit, config.query));
        const listing = firstNonEmptyString(config.listing) ?? 'hot';

        if (subreddit === undefined) {
          return { ok: false, reason: 'Reddit listing source requires subreddit or query.' };
        }

        return supportedRedditListings.has(listing)
          ? { ok: true }
          : { ok: false, reason: `Unsupported Reddit listing: ${listing}` };
      }

      return firstNonEmptyString(config.query, config.term) === undefined
        ? { ok: false, reason: 'Reddit search source requires query or term.' }
        : { ok: true };
    }

    const mode = firstNonEmptyString(config.mode) ?? 'search';
    if (mode !== 'search' && mode !== 'listing') {
      return { ok: false, reason: `Unsupported source query mode: ${mode}` };
    }

    return firstNonEmptyString(config.query, config.term) === undefined
      ? { ok: false, reason: 'Source binding config requires query or term.' }
      : { ok: true };
  }
}

const supportedHackerNewsListings = new Set(['top', 'new', 'best', 'ask', 'show', 'job']);
const supportedRedditListings = new Set(['hot', 'new', 'top', 'rising']);
const blockedHosts = new Set(['localhost', 'localhost.localdomain']);

const firstNonEmptyString = (...values: readonly unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const validateFeedUrl = (value: string): SourceBindingConfigValidationResult => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Feed URL must be absolute.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Feed URL must use http or https.' };
  }

  const hostname = url.hostname.toLowerCase();

  if (blockedHosts.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, reason: 'Feed URL host is not allowed.' };
  }

  if (isPrivateIp(hostname)) {
    return { ok: false, reason: 'Feed URL must not target private or local networks.' };
  }

  return { ok: true };
};

const normalizeSubreddit = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/^r\//i, '').trim();

  return /^[A-Za-z0-9_]{2,21}$/.test(normalized) ? normalized : undefined;
};

const isPrivateIp = (hostname: string): boolean => {
  const parts = hostname.split('.').map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd');
  }

  const [first, second] = parts;

  if (first === undefined || second === undefined) {
    return false;
  }

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
};
