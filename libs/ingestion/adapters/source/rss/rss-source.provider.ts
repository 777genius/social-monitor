import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from '../../../ports';
import { validateFeedUrl } from './feed-url-policy';
import type { RssClientPort, RssFeedItem } from './rss-client.port';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: 'rss',
  displayName: 'RSS/Atom',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['post', 'link'],
  supportedQueryModes: ['url'],
  cursorModel: 'etag_last_modified',
  stableIdentity: ['guid', 'canonicalUrl', 'contentHash'],
  quotaModel: 'per_source_binding',
  limitations: [
    'Uses SSRF-checked HTTP feed polling with ETag and Last-Modified cursor metadata. Publisher policy and retry budget still apply.',
  ],
};

export class RssSourceProvider implements SourceProviderPort {
  constructor(private readonly client: RssClientPort) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    const feedUrl = validateFeedUrl(query.query);

    return feedUrl.ok ? { ok: true } : { ok: false, reason: feedUrl.reason };
  }

  planScan(query: SourceQuery, context: SourceProviderScanContext): SourceProviderScanPlan {
    return {
      query,
      maxItems: readPositiveInteger(context.config?.maxItems, 30, 1, 100),
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    void context;

    const validation = this.validateBinding(plan.query);

    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const feed = await this.client.readFeed(plan.query.query, plan.maxItems, decodeCursor(plan.cursor));

    return {
      items: feed.items.flatMap((item, index) => normalizeItem(item, plan.query.query, index)),
      nextCursor: encodeCursor(feed, plan.cursor),
      warnings: feed.items.some((item) => item.guid === undefined)
        ? ['Some RSS items had no GUID; canonical URL fallback was used.']
        : [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage = error instanceof Error ? error.message : 'Unknown RSS provider error';
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (rawMessage.includes('429') || lowerMessage.includes('rate limit')) {
      return {
        kind: 'rate_limited',
        retryable: true,
        message,
      };
    }

    return {
      kind: rawMessage.includes('Feed URL') ? 'invalid_query' : 'unavailable',
      retryable: !rawMessage.includes('Feed URL'),
      message,
    };
  }
}

const normalizeItem = (item: RssFeedItem, feedUrl: string, index: number) => {
  const title = item.title ?? '';
  const body = item.content ?? '';

  if (title.trim().length === 0 && body.trim().length === 0) {
    return [];
  }

  const canonicalUrl = item.link ?? feedUrl;

  return [
    {
      externalId: item.guid ?? `${canonicalUrl}#${index}`,
      canonicalUrl,
      title,
      body,
      authorHandle: item.author,
      publishedAt: item.publishedAt ?? new Date(0),
    },
  ];
};

const decodeCursor = (cursor: string | undefined) => {
  if (cursor === undefined) {
    return {};
  }

  try {
    const parsed = JSON.parse(cursor) as Readonly<Record<string, unknown>>;

    return {
      etag: typeof parsed.etag === 'string' ? parsed.etag : undefined,
      lastModified: typeof parsed.lastModified === 'string' ? parsed.lastModified : undefined,
    };
  } catch {
    return {};
  }
};

const encodeCursor = (
  feed: { readonly etag?: string; readonly lastModified?: string },
  previousCursor: string | undefined,
): string | undefined => {
  if (feed.etag === undefined && feed.lastModified === undefined) {
    return previousCursor;
  }

  return JSON.stringify({
    etag: feed.etag,
    lastModified: feed.lastModified,
  });
};

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`RSS source config integer must be between ${min} and ${max}`);
  }

  return value;
};
