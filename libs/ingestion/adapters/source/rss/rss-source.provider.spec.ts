import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { certifySourceProvider } from '../testing/source-provider-certification';
import { validateFeedUrl } from './feed-url-policy';
import { FixtureRssClient } from './fixture-rss-client';
import type { RssClientPort } from './rss-client.port';
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
    expect(validateFeedUrl('http://169.254.169.254/latest/meta-data')).toEqual({
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
        metadata: {
          kind: 'rss_item',
          feedUrl: 'https://example.test/feed.xml',
        },
      },
      {
        externalId: 'https://example.test/rss/item-2#1',
        canonicalUrl: 'https://example.test/rss/item-2',
        title: 'RSS item 2 without guid',
        body: 'Second RSS item',
        authorHandle: undefined,
        publishedAt: new Date('2026-06-05T10:01:00.000Z'),
        metadata: {
          kind: 'rss_item',
          feedUrl: 'https://example.test/feed.xml',
        },
      },
    ]);
    expect(result.nextCursor).toBe(JSON.stringify({
      etag: '"fixture-rss-etag"',
      lastModified: 'Fri, 05 Jun 2026 10:02:00 GMT',
    }));
    expect(result.warnings).toEqual(['Some RSS items had no GUID; canonical URL fallback was used.']);
  });

  it('passes ETag and Last-Modified cursor metadata to the RSS client', async () => {
    const client = new FixtureRssClient();
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'rss-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'url' as const, query: 'https://example.test/feed.xml' };

    const result = await provider.scan({
      ...provider.planScan(query, context),
      cursor: JSON.stringify({ etag: '"old-etag"', lastModified: 'Fri, 05 Jun 2026 09:00:00 GMT' }),
    }, context);

    expect(result.items).toHaveLength(2);
    expect(client.lastRead).toEqual({
      feedUrl: 'https://example.test/feed.xml',
      limit: 30,
      options: {
        etag: '"old-etag"',
        lastModified: 'Fri, 05 Jun 2026 09:00:00 GMT',
      },
    });
    expect(result.nextCursor).toBe(JSON.stringify({
      etag: '"fixture-rss-etag"',
      lastModified: 'Fri, 05 Jun 2026 10:02:00 GMT',
    }));
  });

  it('uses source config maxItems to cap feed reads', async () => {
    const client = new FixtureRssClient();
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'rss-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
      config: { maxItems: 1 },
    };
    const query = { mode: 'url' as const, query: 'https://example.test/feed.xml' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items).toHaveLength(1);
    expect(client.lastRead?.limit).toBe(1);
  });

  it('skips readable RSS entries without a published timestamp', async () => {
    const client = {
      async readFeed() {
        return {
          items: [
            {
              guid: 'missing-timestamp',
              link: 'https://example.test/rss/missing-timestamp',
              title: 'Readable but missing timestamp',
              content: 'This entry must not be ingested with an epoch fallback.',
            },
            {
              guid: 'valid-timestamp',
              link: 'https://example.test/rss/valid-timestamp',
              title: 'Readable with timestamp',
              content: 'This entry is safe to ingest.',
              publishedAt: new Date('2026-06-05T10:03:00.000Z'),
            },
          ],
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'rss-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'url' as const, query: 'https://example.test/feed.xml' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items.map((item) => item.externalId)).toEqual(['valid-timestamp']);
    expect(result.items[0]?.publishedAt).toEqual(new Date('2026-06-05T10:03:00.000Z'));
    expect(result.items[0]?.metadata).toEqual({
      kind: 'rss_item',
      feedUrl: 'https://example.test/feed.xml',
    });
    expect(result.warnings).toEqual(['Some RSS items had no published timestamp; they were skipped.']);
  });

  it('skips readable RSS entries without a canonical link', async () => {
    const client = {
      async readFeed() {
        return {
          items: [
            {
              guid: 'missing-link',
              title: 'Readable but missing link',
              content: 'This entry must not cite the feed URL as the article URL.',
              publishedAt: new Date('2026-06-05T10:04:00.000Z'),
            },
            {
              guid: 'valid-link',
              link: 'https://example.test/rss/valid-link',
              title: 'Readable with link',
              content: 'This entry has a stable citation URL.',
              publishedAt: new Date('2026-06-05T10:05:00.000Z'),
            },
          ],
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'rss-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'url' as const, query: 'https://example.test/feed.xml' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items.map((item) => item.externalId)).toEqual(['valid-link']);
    expect(result.items[0]?.canonicalUrl).toBe('https://example.test/rss/valid-link');
    expect(result.warnings).toEqual(['Some RSS items had no canonical link; they were skipped.']);
  });

  it('extracts search query metadata from query-backed RSS feeds', async () => {
    const provider = new RssSourceProvider(new FixtureRssClient());
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'rss-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'url' as const, query: 'https://hnrss.org/newest?q=Flutter' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items[0]?.metadata).toEqual({
      kind: 'rss_item',
      feedUrl: 'https://hnrss.org/newest?q=Flutter',
      searchQuery: 'Flutter',
    });
  });
});
