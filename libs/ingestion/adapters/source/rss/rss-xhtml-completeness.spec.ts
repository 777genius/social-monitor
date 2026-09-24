import { requireCompleteRecoveryScan } from '../../../../../scripts/lib/hn-rss-recovery-acquisition';
import { HttpRssClient } from './http-rss-client';
import type { RssClientPort } from './rss-client.port';
import { RssSourceProvider } from './rss-source.provider';

const feedUrl = 'https://example.test/feed.xml';
const query = { mode: 'url' as const, query: feedUrl };
const context = {
  tenantId: 'tenant-1' as never, workspaceId: 'workspace-1' as never,
  sourceBindingId: 'rss-binding-1', scanJobId: 'scan-job-1', correlationId: 'correlation-1',
  config: { targetPublishedWindow: {
    startInclusive: '2026-06-05T10:00:00.000Z', endExclusive: '2026-06-05T11:00:00.000Z',
  } },
};
const entry = (construct: string): string =>
  `<feed><entry><id>target</id><link href="https://example.test/target"/>${construct}` +
  '<published>2026-06-05T10:30:00Z</published></entry></feed>';
const xhtml = (text: string): string => `<div xmlns="http://www.w3.org/1999/xhtml">${text}</div>`;
const scan = async (provider: RssSourceProvider) => provider.scan(provider.planScan(query, context), context);
const complete = async (provider: RssSourceProvider) =>
  requireCompleteRecoveryScan(provider).scan(provider.planScan(query, context), context);

describe('Atom XHTML recovery completeness', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });
  const respond = (xml: string): void => {
    globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
  };

  // On r20 each reference spelling was counted as visible ASCII and completed recovery.
  it.each(['&#160;', '&#32;', '&#9;', '&#x200B;', '&#xFE0F;'])(
    'rejects an XHTML body containing only the invisible XML reference %s', async (reference) => {
      const body = xhtml(reference);
      respond(entry(`<content type="xhtml">${body}</content>`));
      const client = new HttpRssClient();
      expect((await client.readFeed(feedUrl, 10)).items[0]?.content).toBe(body);
      const provider = new RssSourceProvider(client);
      expect((await scan(provider)).items.map((item) => item.externalId)).toEqual([]);
      expect((await scan(provider)).warnings).toEqual([expect.stringContaining('no readable title or content')]);
      await expect(complete(provider)).rejects.toThrow('partial acquisition');
    },
  );

  // Decoding the final parsed string again would turn these literal spellings into invisible space.
  it.each(['<![CDATA[&#160;]]>', '&amp;#160;'])(
    'keeps literal %s readable with its exact raw body', async (literal) => {
      const body = xhtml(literal);
      respond(entry(`<content type="xhtml">${body}</content>`));
      const provider = new RssSourceProvider(new HttpRssClient());
      const result = await complete(provider);
      expect(result.items).toEqual([expect.objectContaining({ externalId: 'target', body })]);
      expect(result.warnings).toEqual([]);
    },
  );

  // On r20 the normal XML tree converted these text nodes to booleans, which visibility skipped.
  it.each(['title', 'content', 'summary'] as const)(
    'accepts boolean XHTML text in %s, including CDATA false', async (name) => {
      for (const text of ['true', 'false', '<![CDATA[false]]>']) {
        const body = xhtml(text);
        respond(entry(`<${name} type="xhtml">${body}</${name}>`));
        const result = await complete(new RssSourceProvider(new HttpRssClient()));
        expect(result.items.map((item) => item.externalId)).toEqual(['target']);
        expect(result.items[0]?.[name === 'title' ? 'title' : 'body']).toBe(body);
        expect(result.warnings).toEqual([]);
      }
    },
  );

  // On r20 readText omitted parsed booleans from literal text constructs.
  it.each(['title', 'content', 'summary'] as const)(
    'accepts parsed boolean literal text in %s', async (name) => {
      for (const text of ['true', 'false', '<![CDATA[false]]>']) {
        respond(entry(`<${name} type="text">${text}</${name}>`));
        const result = await complete(new RssSourceProvider(new HttpRssClient()));
        expect(result.items.map((item) => item.externalId)).toEqual(['target']);
        expect(result.items[0]?.[name === 'title' ? 'title' : 'body']).toBe(text.includes('CDATA') ? 'false' : text);
        expect(result.warnings).toEqual([]);
      }
    },
  );

  // On r20 a whitespace-only primary content construct suppressed the readable summary.
  it('falls back to summary when XHTML content contains only whitespace', async () => {
    for (const title of ['', '<title>Readable title</title>']) {
      respond(entry(`${title}<content type="xhtml"> \n </content><summary type="text">Readable summary</summary>`));
      const result = await complete(new RssSourceProvider(new HttpRssClient()));
      expect(result.items).toEqual([expect.objectContaining({ externalId: 'target', body: 'Readable summary' })]);
      expect(result.warnings).toEqual([]);
    }
  });

  // On r20 the optional-decision fallback parsed these XML fragments as HTML and certified both.
  it.each([
    xhtml('<p xmlns:é="urn:example"><é:script>hidden</é:script></p>'),
    `${xhtml('<script>hidden</script>')}<?note > <content>INJECTED</content> ?>`,
  ])('does not certify hidden XHTML from a port without a visibility decision', async (body) => {
    const missingDecision = { async readFeed() { return { items: [{
      guid: 'target', link: 'https://example.test/target', content: body, contentType: 'xhtml' as const,
      publishedAt: new Date('2026-06-05T10:30:00Z'),
    }] }; } };
    const provider = new RssSourceProvider(missingDecision as unknown as RssClientPort);
    const result = await scan(provider);
    expect(result.items.map((item) => item.externalId)).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('no readable title or content')]);
    await expect(complete(provider)).rejects.toThrow('partial acquisition');
  });
});
