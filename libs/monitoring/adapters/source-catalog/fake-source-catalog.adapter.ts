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

const githubIssuesProfile: SourceCapabilityProfile = {
  providerKey: 'github-issues',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const githubRepoRadarProfile: SourceCapabilityProfile = {
  providerKey: 'github-repo-radar',
  version: 1,
  productionSafe: true,
  supportsCursor: false,
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
  [githubIssuesProfile.providerKey, githubIssuesProfile],
  [githubRepoRadarProfile.providerKey, githubRepoRadarProfile],
  [redditProfile.providerKey, redditProfile],
]);

const providerAliases = new Map([
  ['github', 'github-issues'],
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

    return sourceProfiles.get(canonicalProviderKey(providerKey)) ?? null;
  }

  async validateBindingConfig(
    providerKey: string,
    config: SourceBindingConfig,
  ): Promise<SourceBindingConfigValidationResult> {
    const canonicalKey = canonicalProviderKey(providerKey);

    if (!this.isProviderAvailable(canonicalKey)) {
      return { ok: false, reason: `Unknown source provider: ${providerKey}` };
    }

    if (canonicalKey === 'rss') {
      const feedUrl = firstNonEmptyString(config.feedUrl, config.url, config.query);

      if (feedUrl === undefined) {
        return { ok: false, reason: 'RSS source requires feedUrl, url or query.' };
      }

      return validateFeedUrl(feedUrl);
    }

    if (canonicalKey === 'hacker-news') {
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

    if (canonicalKey === 'reddit') {
      const mode = firstNonEmptyString(config.mode) ?? 'search';

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

    if (canonicalKey === 'github-issues') {
      const mode = firstNonEmptyString(config.mode) ?? 'search';

      if (mode !== 'search') {
        return { ok: false, reason: `Unsupported GitHub issues query mode: ${mode}` };
      }

      return firstNonEmptyString(config.query, config.term) === undefined
        ? { ok: false, reason: 'GitHub issues search source requires query or term.' }
        : { ok: true };
    }

    if (canonicalKey === 'github-repo-radar') {
      const mode = firstNonEmptyString(config.mode) ?? 'search';

      if (mode !== 'search') {
        return { ok: false, reason: `Unsupported GitHub repo radar query mode: ${mode}` };
      }

      const windows = readStringArray(config.windows);
      const unsupportedWindow = windows.find((window) => !githubRepoRadarWindows.has(window));
      if (unsupportedWindow !== undefined) {
        return { ok: false, reason: `Unsupported GitHub repo radar trend window: ${unsupportedWindow}` };
      }

      const integerValidation = validateBoundedInteger(config.maxItems, 'maxItems', 1, 100)
        ?? validateBoundedInteger(config.maxCandidates, 'maxCandidates', 1, 300)
        ?? validateBoundedInteger(config.minStars, 'minStars', 0, 1_000_000);
      if (integerValidation !== undefined) {
        return integerValidation;
      }

      return firstNonEmptyString(config.query, config.term, firstStringArrayItem(config.topics), firstStringArrayItem(config.languages)) === undefined
        ? { ok: false, reason: 'GitHub repo radar source requires query, term, topics or languages.' }
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
    const canonicalKey = canonicalProviderKey(providerKey);

    if (!sourceProfiles.has(canonicalKey)) {
      return false;
    }

    return this.includeFixtureProviders || !fixtureProviderKeys.has(canonicalKey);
  }
}

const canonicalProviderKey = (providerKey: string): string =>
  providerAliases.get(providerKey) ?? providerKey;

const supportedHackerNewsListings = new Set(['top', 'new', 'best', 'ask', 'show', 'job']);
const supportedRedditListings = new Set(['hot', 'new', 'top', 'rising']);
const githubRepoRadarWindows = new Set(['24h', '7d', '30d', '90d']);

const firstNonEmptyString = (...values: readonly unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const firstStringArrayItem = (value: unknown): string | undefined =>
  readStringArray(value)[0]?.trim();

const validateBoundedInteger = (
  value: unknown,
  field: string,
  min: number,
  max: number,
): SourceBindingConfigValidationResult | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? undefined
    : { ok: false, reason: `GitHub repo radar ${field} must be an integer between ${min} and ${max}.` };
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
