import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { requireCompleteRecoveryFetch, requireCompleteRecoveryScan } from '../../../../../scripts/lib/hn-rss-recovery-acquisition';
import { parseRecoveryArgs } from '../../../../../scripts/lib/hn-rss-recovery-plan';
import { runRecoveryInDisposableJournalForTest } from '../../../../../scripts/run-hn-rss-recovery';
import { InMemorySourceProviderRegistry } from '../in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../registry-source-fetcher.adapter';
import { HttpRssClient } from './http-rss-client';
import type { RssClientPort } from './rss-client.port';
import { RssSourceProvider } from './rss-source.provider';

const feedUrl = 'https://example.test/feed.xml';
const from = '2026-06-05T10:00:00.000Z';
const to = '2026-06-05T11:00:00.000Z';
const targetPublishedWindow = { startInclusive: from, endExclusive: to };
const query = { mode: 'url' as const, query: feedUrl };
const scope = (config: Record<string, unknown> = {}) => ({
  tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'),
  sourceBindingId: 'rss-binding-1', scanJobId: 'scan-job-1', correlationId: 'correlation-1',
  config: { targetPublishedWindow, ...config },
});

describe('RSS historical completeness', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('warns for an identified dated entry with no readable title or content, including when a valid entry survives', async () => {
    const client = {
      async readFeed() {
        return { items: [
          { guid: 'contentless', link: 'https://example.test/contentless', publishedAt: new Date(from) },
          { guid: 'valid', link: 'https://example.test/valid', title: 'Valid item', publishedAt: new Date(from) },
        ] };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = scope();
    const result = await provider.scan(provider.planScan(query, context), context);
    expect(result.items.map((item) => item.externalId)).toEqual(['valid']);
    expect(result.warnings).toEqual([expect.stringContaining('no readable title or content')]);
    await expect(requireCompleteRecoveryScan(provider).scan(provider.planScan(query, context), context))
      .rejects.toThrow('partial acquisition');
  });

  it('does not warn for a contentless entry dated outside the requested interval', async () => {
    const provider = new RssSourceProvider({
      async readFeed() {
        return { items: [{ guid: 'outside', link: 'https://example.test/outside',
          publishedAt: new Date('2026-06-05T11:00:00.000Z') }] };
      },
    });
    const context = scope();
    const result = await provider.scan(provider.planScan(query, context), context);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it.each([
    ['RSS CDATA markup', '<rss><channel><item><guid>empty-rss</guid><link>https://example.test/empty-rss</link><description><![CDATA[<p><br/></p>]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>'],
    ['Atom HTML content', '<feed><entry><id>empty-atom</id><link href="https://example.test/empty-atom"/><content type="html">&lt;p&gt;&lt;br/&gt;&lt;/p&gt;</content><published>2026-06-05T10:30:00Z</published></entry></feed>'],
    ['RSS whitespace entities', '<rss><channel><item><guid>empty-entities</guid><link>https://example.test/empty-entities</link><description><![CDATA[<p>&nbsp;&#160;&#x2003;&ZeroWidthSpace;</p>]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>'],
  ])('rejects in-window %s as unreadable through the recovery scan wrapper', async (_kind, xml) => {
    globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
    const provider = new RssSourceProvider(new HttpRssClient());
    const context = scope();
    const plan = provider.planScan(query, context);
    const result = await provider.scan(plan, context);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('no readable title or content')]);
    await expect(requireCompleteRecoveryScan(provider).scan(plan, context))
      .rejects.toThrow('partial acquisition');
  });

  it.each([
    ['RSS text inside markup', '<rss><channel><item><guid>rss-text</guid><link>https://example.test/rss-text</link><description><![CDATA[<p>Readable <strong>story</strong></p>]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>', 'rss-text'],
    ['Atom text inside HTML', '<feed><entry><id>atom-text</id><link href="https://example.test/atom-text"/><content type="html">&lt;p&gt;Readable &lt;strong&gt;story&lt;/strong&gt;&lt;/p&gt;</content><published>2026-06-05T10:30:00Z</published></entry></feed>', 'atom-text'],
    ['RSS visible entity', '<rss><channel><item><guid>rss-entity</guid><link>https://example.test/rss-entity</link><description><![CDATA[<p>&#65;&nbsp;</p>]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>', 'rss-entity'],
  ])('accepts in-window %s', async (_kind, xml, id) => {
    globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
    const provider = requireCompleteRecoveryScan(new RssSourceProvider(new HttpRssClient()));
    const context = scope();
    const result = await provider.scan(provider.planScan(query, context), context);
    expect(result.items.map((item) => item.externalId)).toEqual([id]);
    expect(result.warnings).toEqual([]);
  });

  it.each(['<rss><channel/></rss>', '<feed/>'])('accepts a genuinely empty feed: %s', async (xml) => {
    globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
    const provider = requireCompleteRecoveryScan(new RssSourceProvider(new HttpRssClient()));
    const context = scope();
    const result = await provider.scan(provider.planScan(query, context), context);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('propagates empty parsed item rejection across feeds without losing valid results or cursors', async () => {
    const secondary = 'https://feeds.example.test/second.xml';
    globalThis.fetch = jest.fn(async (url: string) => new Response(
      url === feedUrl
        ? '<rss><channel><item/></channel></rss>'
        : '<rss><channel><item><guid>valid</guid><link>https://example.test/valid</link><title>Valid</title><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>',
      { status: 200, headers: { etag: url === feedUrl ? '"primary"' : '"secondary"' } },
    )) as unknown as typeof fetch;
    const provider = new RssSourceProvider(new HttpRssClient());
    const context = scope({ feedUrls: [secondary] });
    const result = await provider.scan(provider.planScan(query, context), context);
    expect(result.items.map((item) => item.externalId)).toEqual(['valid']);
    expect(result.warnings).toEqual([expect.stringContaining('could not be parsed')]);
    expect(JSON.parse(result.nextCursor ?? '{}')).toEqual({ feeds: {
      [feedUrl]: { etag: '"primary"' }, [secondary]: { etag: '"secondary"' },
    } });
    await expect(requireCompleteRecoveryScan(provider).scan(provider.planScan(query, context), context))
      .rejects.toThrow('partial acquisition');
  });

  it.each([
    ['identified contentless item', '<item><guid>contentless</guid><link>https://example.test/contentless</link><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item>'],
    ['empty parsed item', '<item/>'],
    ['RSS markup-only item beside a valid item', '<item><guid>empty-rss</guid><link>https://example.test/empty-rss</link><description><![CDATA[<p><br/></p>]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item><item><guid>valid</guid><link>https://example.test/valid</link><title>Valid item</title><pubDate>Fri, 05 Jun 2026 10:31:00 GMT</pubDate></item>'],
    ['Atom HTML-only entry', '<feed><entry><id>empty-atom</id><link href="https://example.test/empty-atom"/><content type="html">&lt;p&gt;&lt;br/&gt;&lt;/p&gt;</content><published>2026-06-05T10:30:00Z</published></entry></feed>'],
  ])('refuses a completed recovery receipt for an %s', async (_case, item) => {
    const directory = mkdtempSync(join(tmpdir(), 'rss-completeness-'));
    try {
      const xml = item.startsWith('<feed>') ? item : `<rss><channel>${item}</channel></rss>`;
      globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
      const fetcher = requireCompleteRecoveryFetch(new RegistrySourceFetcherAdapter(
        new InMemorySourceProviderRegistry([requireCompleteRecoveryScan(new RssSourceProvider(new HttpRssClient()))], []),
        { async readConfig() { return { feedUrl, targetPublishedWindow }; } },
      ));
      const binding = {
        interestId: '00000000-0000-7000-8000-000000000104',
        scanPolicyId: '00000000-0000-7000-8000-000000000105',
        interestQuery: 'synthetic',
        config: { feedUrl },
      };
      const argv = [
        '--tenant-id', '00000000-0000-7000-8000-000000000101',
        '--workspace-id', '00000000-0000-7000-8000-000000000102',
        '--source-binding-id', '00000000-0000-7000-8000-000000000103',
        '--provider', 'rss', '--from', from, '--to', to, '--journal-dir', directory,
      ];
      const dependencies = {
        readBinding: async () => binding,
        acquire: async () => {
          const result = await fetcher.fetch({
            tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'),
            sourceBindingId: 'rss-binding-1', scanJobId: 'scan-job-1', correlationId: 'correlation-1',
            providerKey: 'rss', sourceQuery: query,
          });
          return { fetched: result.items.length, inserted: 0, projected: 0,
            skippedDuplicates: 0, warningCount: result.warnings?.length ?? 0 };
        },
      };
      const plan = await runRecoveryInDisposableJournalForTest(parseRecoveryArgs(argv, new Date('2026-09-24T00:00:00.000Z')), dependencies);
      await expect(runRecoveryInDisposableJournalForTest(
        parseRecoveryArgs([...argv, '--apply', '--plan-sha256', String(plan.planSha256)], new Date('2026-09-24T00:00:00.000Z')),
        dependencies,
      )).rejects.toThrow('partial acquisition');
      expect(readdirSync(directory).some((name) => name.endsWith('.completed.json'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
