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
    ...['<p title=">"> </p>', '<!-- hidden', '<script>hidden', '<style>p{color:red}', '&ThickSpace;&NoBreak;', '\uFE0F']
      .map((body) => [body, `<rss><channel><item><guid>unreadable</guid><link>https://example.test/unreadable</link><description><![CDATA[${body}]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>`]),
    ['Atom HTML title', '<feed><entry><id>html-title</id><link href="https://example.test/html-title"/><title type="html">&lt;script&gt;hidden&lt;/script&gt;</title><published>2026-06-05T10:30:00Z</published></entry></feed>'],
    ['Atom HTML summary', '<feed><entry><id>html-summary</id><link href="https://example.test/html-summary"/><summary type="html">&lt;style&gt;hidden&lt;/style&gt;</summary><published>2026-06-05T10:30:00Z</published></entry></feed>'],
    ['Atom XHTML markup-only title', '<feed><entry><id>xhtml-empty</id><link href="https://example.test/xhtml-empty"/><title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><br/></div></title><published>2026-06-05T10:30:00Z</published></entry></feed>'],
    ['Atom non-text content', '<feed><entry><id>binary</id><link href="https://example.test/binary"/><content type="image/png">aGVsbG8=</content><published>2026-06-05T10:30:00Z</published></entry></feed>'],
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
    ['RSS HTML euro entity', '<rss><channel><item><guid>euro</guid><link>https://example.test/euro</link><description><![CDATA[&#x80;]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>', 'euro'],
    ['RSS XML expanded euro entity', '<rss><channel><item><guid>xml-euro</guid><link>https://example.test/xml-euro</link><description>&#128;</description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>', 'xml-euro'],
    ['RSS visible text with selector', '<rss><channel><item><guid>selector</guid><link>https://example.test/selector</link><description><![CDATA[A\uFE0F]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>', 'selector'],
    ['Atom literal text title', '<feed><entry><id>literal-title</id><link href="https://example.test/literal-title"/><title type="text">&lt;script&gt;</title><published>2026-06-05T10:30:00Z</published></entry></feed>', 'literal-title'],
    ['Atom literal text content', '<feed><entry><id>literal-content</id><link href="https://example.test/literal-content"/><content type="text">&lt;script&gt;</content><published>2026-06-05T10:30:00Z</published></entry></feed>', 'literal-content'],
    ['Atom MIME HTML content', '<feed><entry><id>mime-html</id><link href="https://example.test/mime-html"/><content type="text/html">&lt;p&gt;Readable&lt;/p&gt;</content><published>2026-06-05T10:30:00Z</published></entry></feed>', 'mime-html'],
    ['Atom literal text summary', '<feed><entry><id>literal-summary</id><link href="https://example.test/literal-summary"/><summary type="text">&lt;script&gt;</summary><published>2026-06-05T10:30:00Z</published></entry></feed>', 'literal-summary'],
    ['Atom XHTML title', '<feed><entry><id>xhtml-title</id><link href="https://example.test/xhtml-title"/><title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Readable</p></div></title><published>2026-06-05T10:30:00Z</published></entry></feed>', 'xhtml-title'],
    ['Atom XHTML literal escaped title', '<feed><entry><id>xhtml-literal</id><link href="https://example.test/xhtml-literal"/><title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">&lt;script&gt;</div></title><published>2026-06-05T10:30:00Z</published></entry></feed>', 'xhtml-literal'],
  ])('accepts in-window %s', async (_kind, xml, id) => {
    globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
    const provider = requireCompleteRecoveryScan(new RssSourceProvider(new HttpRssClient()));
    const context = scope();
    const result = await provider.scan(provider.planScan(query, context), context);
    expect(result.items.map((item) => item.externalId)).toEqual([id]);
    expect(result.warnings).toEqual([]);
  });

  it('retains a literal Atom text title without a body in ordinary ingestion', async () => {
    const xml = '<feed><entry><id>literal-title</id><link href="https://example.test/literal-title"/><title type="text">&lt;script&gt;</title><published>2026-06-05T10:30:00Z</published></entry></feed>';
    globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
    const feed = await new HttpRssClient().readFeed(feedUrl, 30);
    expect(feed.items).toEqual([expect.objectContaining({ title: '<script>', titleType: 'text', content: undefined })]);
    const provider = new RssSourceProvider(new HttpRssClient());
    const context = scope({ targetPublishedWindow: undefined });
    const result = await provider.scan(provider.planScan(query, context), context);
    expect(result.items).toEqual([expect.objectContaining({ externalId: 'literal-title', title: '<script>', body: '' })]);
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
    ['RSS malformed HTML item beside a valid item', '<item><guid>hidden</guid><link>https://example.test/hidden</link><description><![CDATA[<script>hidden]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item><item><guid>valid</guid><link>https://example.test/valid</link><title>Valid item</title><pubDate>Fri, 05 Jun 2026 10:31:00 GMT</pubDate></item>'],
    ['RSS invisible entities', '<item><guid>invisible</guid><link>https://example.test/invisible</link><description><![CDATA[&ThickSpace;&NoBreak;]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item>'],
    ['RSS variation selector', '<item><guid>selector</guid><link>https://example.test/selector</link><description><![CDATA[\uFE0F]]></description><pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item>'],
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

  it.each([
    ['literal Atom title only', '<feed><entry><id>literal</id><link href="https://example.test/literal"/><title type="text">&lt;script&gt;</title><published>2026-06-05T10:30:00Z</published></entry></feed>'],
    ['empty RSS feed', '<rss><channel/></rss>'],
  ])('completes a recovery receipt for %s', async (_case, xml) => {
    const directory = mkdtempSync(join(tmpdir(), 'rss-complete-'));
    try {
      globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
      const fetcher = requireCompleteRecoveryFetch(new RegistrySourceFetcherAdapter(
        new InMemorySourceProviderRegistry([requireCompleteRecoveryScan(new RssSourceProvider(new HttpRssClient()))], []),
        { async readConfig() { return { feedUrl, targetPublishedWindow }; } },
      ));
      const argv = [
        '--tenant-id', '00000000-0000-7000-8000-000000000101',
        '--workspace-id', '00000000-0000-7000-8000-000000000102',
        '--source-binding-id', '00000000-0000-7000-8000-000000000103',
        '--provider', 'rss', '--from', from, '--to', to, '--journal-dir', directory,
      ];
      const dependencies = {
        readBinding: async () => ({
          interestId: '00000000-0000-7000-8000-000000000104',
          scanPolicyId: '00000000-0000-7000-8000-000000000105',
          interestQuery: 'synthetic',
          config: { feedUrl },
        }),
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
      await runRecoveryInDisposableJournalForTest(
        parseRecoveryArgs([...argv, '--apply', '--plan-sha256', String(plan.planSha256)], new Date('2026-09-24T00:00:00.000Z')),
        dependencies,
      );
      expect(readdirSync(directory).some((name) => name.endsWith('.completed.json'))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
