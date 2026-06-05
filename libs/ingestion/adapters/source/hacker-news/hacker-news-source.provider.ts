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
import type { HackerNewsClientPort, HackerNewsStory } from './hacker-news-client.port';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: 'hacker-news',
  displayName: 'Hacker News',
  version: 1,
  productionSafe: false,
  supportedContentUnits: ['post', 'comment', 'link'],
  supportedQueryModes: ['search', 'listing'],
  cursorModel: 'time',
  stableIdentity: ['providerId', 'canonicalUrl'],
  quotaModel: 'per_app',
  limitations: [
    'Fixture-backed MVP provider; production HTTP client and rate-limit policy must pass certification before enablement.',
  ],
};

export class HackerNewsSourceProvider implements SourceProviderPort {
  constructor(private readonly client: HackerNewsClientPort) {}

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

    if (query.query.trim().length === 0) {
      return { ok: false, reason: 'Query must be non-empty' };
    }

    return { ok: true };
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

    const stories = await this.client.searchStories(plan.query.query, plan.maxItems);

    return {
      items: stories.flatMap((story) => normalizeStory(story)),
      warnings: stories.some((story) => story.deleted || story.dead)
        ? ['Some Hacker News stories were deleted/dead and skipped.']
        : [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      kind: 'unavailable',
      retryable: true,
      message: error instanceof Error ? error.message : 'Unknown Hacker News provider error',
    };
  }
}

const normalizeStory = (story: HackerNewsStory) => {
  if (story.deleted || story.dead || story.title === undefined) {
    return [];
  }

  const canonicalUrl = story.url ?? `https://news.ycombinator.com/item?id=${story.id}`;
  const publishedAt = typeof story.time === 'number'
    ? new Date(story.time * 1000)
    : new Date(0);

  return [
    {
      externalId: `hn:${story.id}`,
      canonicalUrl,
      title: story.title,
      body: story.text ?? '',
      authorHandle: story.by,
      publishedAt,
    },
  ];
};
