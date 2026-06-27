import { status } from '@grpc/grpc-js';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { XTwitterSourceProvider } from './x-twitter-experimental-daily-source.provider';
import type {
  XDailyCollectorClientPort,
  XDailyCollectorRequest,
} from './x-daily-collector-client.port';

describe('XTwitterSourceProvider', () => {
  it('plans and scans through the collector client without leaking gRPC details', async () => {
    const collector = new RecordingCollector();
    const provider = new XTwitterSourceProvider(
      collector,
      { now: () => new Date('2026-06-27T00:00:00.000Z') },
    );
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanJobId: 'scan-1',
      correlationId: 'corr-1',
      config: {
        language: 'en',
        windowHours: 48,
        searchProducts: ['top', 'latest'],
        limitPerProduct: 10,
        minLikes: 20,
      },
    };

    const plan = provider.planScan({
      mode: 'search',
      query: 'ai agents',
    }, context);
    const result = await provider.scan(plan, context);

    expect(collector.requests).toEqual([expect.objectContaining({
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
      query: 'ai agents',
      language: 'en',
      windowHours: 48,
      windowEnd: new Date('2026-06-27T00:00:00.000Z'),
      searchProducts: ['top', 'latest'],
      limitPerProduct: 10,
      minLikes: 20,
      maxItems: 25,
    })]);
    expect(result).toMatchObject({
      nextCursor: 'cursor-1',
      warnings: ['partial: one page skipped'],
      items: [{
        externalId: 'x-twitter:123',
        canonicalUrl: 'https://x.com/a/status/123',
        authorHandle: 'a',
        metadata: expect.objectContaining({
          kind: 'x_post',
          provider: 'x-twitter',
          tweetId: '123',
          searchQuery: 'ai agents',
          likes: 100,
          retweets: 10,
          replies: 4,
          publicMetrics: expect.objectContaining({
            like_count: 100,
            retweet_count: 10,
            reply_count: 4,
          }),
        }),
      }],
    });
    expect(hasUndefinedValue(result.items[0]?.metadata)).toBe(false);
    expect(result.items[0]?.metadata).not.toHaveProperty('quotes');
    expect(result.items[0]?.metadata).not.toHaveProperty('impressions');
  });

  it('keeps invalid bindings non-retryable through validation', () => {
    const provider = new XTwitterSourceProvider(
      new RecordingCollector(),
      { now: () => new Date('2026-06-27T00:00:00.000Z') },
    );

    expect(provider.validateBinding({ mode: 'listing', query: 'ai' })).toEqual({
      ok: false,
      reason: 'Unsupported query mode: listing',
    });
    expect(provider.validateBinding({ mode: 'search', query: 'a' })).toEqual({
      ok: false,
      reason: 'X/Twitter search query must be 2-500 characters',
    });
  });

  it('classifies gRPC status codes into source provider failures', () => {
    const provider = new XTwitterSourceProvider(
      new RecordingCollector(),
      { now: () => new Date('2026-06-27T00:00:00.000Z') },
    );

    expect(provider.classifyError(errorWithCode(status.RESOURCE_EXHAUSTED))).toMatchObject({
      kind: 'rate_limited',
      retryable: true,
    });
    expect(provider.classifyError(errorWithCode(status.UNAUTHENTICATED))).toMatchObject({
      kind: 'auth_failed',
      retryable: false,
    });
    expect(provider.classifyError(errorWithCode(status.INVALID_ARGUMENT))).toMatchObject({
      kind: 'invalid_query',
      retryable: false,
    });
  });
});

const hasUndefinedValue = (value: unknown): boolean => {
  if (value === undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(hasUndefinedValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(hasUndefinedValue);
  }

  return false;
};

class RecordingCollector implements XDailyCollectorClientPort {
  readonly requests: XDailyCollectorRequest[] = [];

  async collectDailySearch(
    request: XDailyCollectorRequest,
  ): Promise<Awaited<ReturnType<XDailyCollectorClientPort['collectDailySearch']>>> {
    this.requests.push(request);

    return {
      posts: [{
        tweetId: '123',
        canonicalUrl: 'https://x.com/a/status/123',
        text: 'hello',
        authorHandle: 'a',
        authorName: 'A',
        publishedAt: new Date('2026-06-27T00:00:00.000Z'),
        metrics: {
          likes: 100,
          retweets: 10,
          replies: 4,
        },
        mediaUrls: [],
        sourceProduct: 'top',
        trendScore: 138,
      }],
      nextCursor: 'cursor-1',
      warnings: [{ code: 'partial', message: 'one page skipped' }],
    };
  }
}

const errorWithCode = (code: number): Error & { code: number; details: string } => {
  const error = new Error(`grpc ${code}`) as Error & { code: number; details: string };
  error.code = code;
  error.details = `grpc ${code}`;
  return error;
};
