import { resolveRuntimeProfile } from '@social-monitor/platform-config';
import { validateOutboundUrl } from '@social-monitor/shared-kernel';

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

const githubProfile: SourceCapabilityProfile = {
  providerKey: 'github',
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
  [githubProfile.providerKey, githubProfile],
  [redditProfile.providerKey, redditProfile],
]);

type FakeSourceCatalogAdapterOptions = {
  readonly includeFixtureProviders?: boolean;
};

const fixtureProviderKeys = new Set(['fake-source']);

export const shouldIncludeFixtureSourceCatalogEntries = (env: NodeJS.ProcessEnv): boolean =>
  resolveRuntimeProfile(env) !== 'beta';

export class FakeSourceCatalogAdapter implements SourceCatalogPort {
  private readonly includeFixtureProviders: boolean;

  constructor(options: FakeSourceCatalogAdapterOptions = {}) {
    this.includeFixtureProviders = options.includeFixtureProviders ?? true;
  }

  async getCapability(providerKey: string): Promise<SourceCapabilityProfile | null> {
    if (!this.isProviderAvailable(providerKey)) {
      return null;
    }

    return sourceProfiles.get(providerKey) ?? null;
  }

  async validateBindingConfig(
    providerKey: string,
    config: SourceBindingConfig,
  ): Promise<SourceBindingConfigValidationResult> {
    if (!this.isProviderAvailable(providerKey)) {
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

    if (providerKey === 'github') {
      const mode = firstNonEmptyString(config.mode) ?? 'search';

      if (mode !== 'search') {
        return { ok: false, reason: `Unsupported GitHub query mode: ${mode}` };
      }

      return firstNonEmptyString(config.query, config.term) === undefined
        ? { ok: false, reason: 'GitHub search source requires query or term.' }
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

  private isProviderAvailable(providerKey: string): boolean {
    if (!sourceProfiles.has(providerKey)) {
      return false;
    }

    return this.includeFixtureProviders || !fixtureProviderKeys.has(providerKey);
  }
}

const supportedHackerNewsListings = new Set(['top', 'new', 'best', 'ask', 'show', 'job']);
const supportedRedditListings = new Set(['hot', 'new', 'top', 'rising']);

const firstNonEmptyString = (...values: readonly unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const validateFeedUrl = (value: string): SourceBindingConfigValidationResult => {
  const result = validateOutboundUrl(value, {
    label: 'Feed URL',
    allowedProtocols: ['http:', 'https:'],
  });

  return result.ok ? { ok: true } : result;
};

const normalizeSubreddit = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/^r\//i, '').trim();

  return /^[A-Za-z0-9_]{2,21}$/.test(normalized) ? normalized : undefined;
};
