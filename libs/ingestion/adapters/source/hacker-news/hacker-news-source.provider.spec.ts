import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { certifySourceProvider } from '../testing/source-provider-certification';
import { FixtureHackerNewsClient } from './fixture-hacker-news-client';
import type { HackerNewsClientPort } from './hacker-news-client.port';
import { HackerNewsSourceProvider } from './hacker-news-source.provider';

describe('HackerNewsSourceProvider', () => {
  certifySourceProvider({
    providerFactory: () => new HackerNewsSourceProvider(new FixtureHackerNewsClient()),
    validQuery: { mode: 'search', query: 'monitoring' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'hacker-news',
    expectedFailureKind: 'unavailable',
  });

  it('normalizes fixture stories and skips deleted items', async () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient());
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'hn-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'search' as const, query: 'monitoring' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items).toEqual([
      {
        externalId: 'hn:1001',
        canonicalUrl: 'https://example.test/hn/social-monitoring',
        title: 'Show HN: Social monitoring architecture',
        body: '',
        authorHandle: 'alice',
        publishedAt: new Date(1_780_000_000 * 1000),
        metadata: {
          kind: 'hacker_news_story',
          source: 'search',
          points: 42,
          comments: 9,
        },
      },
      {
        externalId: 'hn:1002',
        canonicalUrl: 'https://news.ycombinator.com/item?id=1002',
        title: 'Ask HN: Reliable RSS and API ingestion',
        body: 'How do you build reliable social/news ingestion?',
        authorHandle: 'bob',
        publishedAt: new Date(1_780_000_060 * 1000),
        metadata: {
          kind: 'hacker_news_story',
          source: 'search',
          points: 75,
          comments: 18,
        },
      },
    ]);
    expect(result.warnings).toEqual(['Some Hacker News stories were deleted/dead and skipped.']);
  });

  it('supports live listing mode through the client port without changing normalized output', async () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient());
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'hn-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'listing' as const, query: 'top' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items[0]).toMatchObject({
      externalId: 'hn:1001',
      title: 'Show HN: Social monitoring architecture',
    });
  });

  it('uses source config maxItems to cap listing and search reads', async () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient());
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'hn-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
      config: { maxItems: 1 },
    };
    const query = { mode: 'search' as const, query: 'monitoring' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.externalId).toBe('hn:1001');
  });

  it('skips readable stories without a valid time timestamp', async () => {
    const client = {
      async searchStories() {
        return [
          {
            id: 2001,
            title: 'Readable but missing HN time',
            text: 'This story must not be ingested with an epoch fallback.',
            by: 'timestampless',
            score: 15,
            comments: 4,
          },
          {
            id: 2002,
            title: 'Readable with HN time',
            text: 'This story is safe to ingest.',
            by: 'timely',
            time: 1_780_000_180,
            score: 30,
            comments: 8,
          },
        ];
      },
      async listStories() {
        return [];
      },
    } satisfies HackerNewsClientPort;
    const provider = new HackerNewsSourceProvider(client);
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'hn-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'search' as const, query: 'monitoring' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items.map((item) => item.externalId)).toEqual(['hn:2002']);
    expect(result.items[0]?.publishedAt).toEqual(new Date(1_780_000_180 * 1000));
    expect(result.warnings).toEqual([
      'Some Hacker News stories had no valid time timestamp; they were skipped.',
    ]);
  });

  it('rejects unsupported listing names before provider calls', () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient());

    expect(provider.validateBinding({ mode: 'listing', query: 'frontpage' })).toEqual({
      ok: false,
      reason: 'Unsupported Hacker News listing: frontpage',
    });
  });
});
