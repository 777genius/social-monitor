import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { certifySourceProvider } from '../testing/source-provider-certification';
import { FixtureHackerNewsClient } from './fixture-hacker-news-client';
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
      },
      {
        externalId: 'hn:1002',
        canonicalUrl: 'https://news.ycombinator.com/item?id=1002',
        title: 'Ask HN: Reliable RSS and API ingestion',
        body: 'How do you build reliable social/news ingestion?',
        authorHandle: 'bob',
        publishedAt: new Date(1_780_000_060 * 1000),
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

  it('rejects unsupported listing names before provider calls', () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient());

    expect(provider.validateBinding({ mode: 'listing', query: 'frontpage' })).toEqual({
      ok: false,
      reason: 'Unsupported Hacker News listing: frontpage',
    });
  });
});
