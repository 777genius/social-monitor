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
  productionSafe: false,
  supportedContentUnits: ['post', 'link'],
  supportedQueryModes: ['url'],
  cursorModel: 'etag_last_modified',
  stableIdentity: ['guid', 'canonicalUrl', 'contentHash'],
  quotaModel: 'per_source_binding',
  limitations: [
    'Fixture-backed MVP provider; production HTTP client must enforce SSRF policy, ETag and Last-Modified.',
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
    void context;

    return {
      query,
      maxItems: 30,
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

    const items = await this.client.readFeed(plan.query.query, plan.maxItems);

    return {
      items: items.flatMap((item, index) => normalizeItem(item, plan.query.query, index)),
      warnings: items.some((item) => item.guid === undefined)
        ? ['Some RSS items had no GUID; canonical URL fallback was used.']
        : [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      kind: error instanceof Error && error.message.includes('Feed URL') ? 'invalid_query' : 'unavailable',
      retryable: !(error instanceof Error && error.message.includes('Feed URL')),
      message: error instanceof Error ? error.message : 'Unknown RSS provider error',
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
