import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { certifySourceProvider } from '../testing/source-provider-certification';
import { validateFeedUrl } from './feed-url-policy';
import { FixtureRssClient } from './fixture-rss-client';
import { RssSourceProvider } from './rss-source.provider';

describe('RssSourceProvider', () => {
  certifySourceProvider({
    providerFactory: () => new RssSourceProvider(new FixtureRssClient()),
    validQuery: { mode: 'url', query: 'https://example.test/feed.xml' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'rss',
    expectedFailureKind: 'unavailable',
  });

  it('rejects local or private feed URLs before scanning', () => {
    expect(validateFeedUrl('http://localhost/feed.xml')).toEqual({
      ok: false,
      reason: 'Feed URL host is not allowed.',
    });
    expect(validateFeedUrl('http://192.168.1.10/feed.xml')).toEqual({
      ok: false,
      reason: 'Feed URL must not target private or local networks.',
    });
    expect(validateFeedUrl('file:///tmp/feed.xml')).toEqual({
      ok: false,
      reason: 'Feed URL must use http or https.',
    });
  });

  it('normalizes RSS fixture items and skips empty entries', async () => {
    const provider = new RssSourceProvider(new FixtureRssClient());
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'rss-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'url' as const, query: 'https://example.test/feed.xml' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items).toEqual([
      {
        externalId: 'rss-guid-1',
        canonicalUrl: 'https://example.test/rss/item-1',
        title: 'RSS item 1',
        body: 'First RSS item',
        authorHandle: 'rss-author',
        publishedAt: new Date('2026-06-05T10:00:00.000Z'),
      },
      {
        externalId: 'https://example.test/rss/item-2#1',
        canonicalUrl: 'https://example.test/rss/item-2',
        title: 'RSS item 2 without guid',
        body: 'Second RSS item',
        authorHandle: undefined,
        publishedAt: new Date('2026-06-05T10:01:00.000Z'),
      },
    ]);
    expect(result.warnings).toEqual(['Some RSS items had no GUID; canonical URL fallback was used.']);
  });
});
