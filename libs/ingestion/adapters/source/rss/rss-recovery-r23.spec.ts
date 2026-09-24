import { requireCompleteRecoveryScan } from '../../../../../scripts/lib/hn-rss-recovery-acquisition';
import { HttpRssClient } from './http-rss-client';
import type { RssClientPort } from './rss-client.port';
import { RssSourceProvider } from './rss-source.provider';

const feedUrl = 'https://example.test/feed.xml';
const window = {
  startInclusive: '2026-06-05T10:00:00.000Z',
  endExclusive: '2026-06-05T11:00:00.000Z',
};
const context = {
  tenantId: 'tenant-1' as never, workspaceId: 'workspace-1' as never,
  sourceBindingId: 'rss-binding-1', scanJobId: 'scan-job-1', correlationId: 'correlation-1',
  config: { targetPublishedWindow: window },
};
const atom = (body: string): string => '<feed><entry><id>target</id>' +
  `<link href="https://example.test/target"/><content type="xhtml"><div>${body}</div></content>` +
  '<published>2026-06-05T10:30:00Z</published></entry></feed>';
const respond = (xml: string): void => {
  globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
};
const complete = async (client: RssClientPort) => {
  const provider = requireCompleteRecoveryScan(new RssSourceProvider(client));
  return provider.scan(provider.planScan({ mode: 'url', query: feedUrl }, context), context);
};

describe('RSS recovery r23 reference and body evidence', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it.each([
    ['space', ' '], ['tab', '\t'], ['newline', '\n'], ['invisible character', '\u200B'],
  ])('accepts a declared %s beside readable XHTML text', async (_case, whitespace) => {
    respond(`<!DOCTYPE feed [<!ENTITY blank "${whitespace}">]>` + atom('Readable &blank;'));
    expect((await complete(new HttpRssClient())).items).toEqual([
      expect.objectContaining({ externalId: 'target', body: '<div>Readable &blank;</div>' }),
    ]);
  });

  it('uses a readable summary when a declared space leaves the XHTML body blank', async () => {
    respond('<!DOCTYPE feed [<!ENTITY blank " ">]>' +
      '<feed><entry><id>target</id><link href="https://example.test/target"/>' +
      '<content type="xhtml"><div>&blank;</div></content>' +
      '<summary type="text">Readable summary</summary>' +
      '<published>2026-06-05T10:30:00Z</published></entry></feed>');
    expect((await complete(new HttpRssClient())).items).toEqual([
      expect.objectContaining({ externalId: 'target', body: 'Readable summary' }),
    ]);
  });

  it('accepts a declared space in an attribute of a readable XHTML item', async () => {
    respond('<!DOCTYPE feed [<!ENTITY blank " ">]>' + atom('<p data-note="&blank;">Readable</p>'));
    expect((await complete(new HttpRssClient())).items).toEqual([
      expect.objectContaining({ externalId: 'target', body: '<div><p data-note="&blank;">Readable</p></div>' }),
    ]);
  });

  it('keeps a declared space-only XHTML body without summary incomplete', async () => {
    respond('<!DOCTYPE feed [<!ENTITY blank " ">]>' + atom('&blank;'));
    expect((await new HttpRssClient().readFeed(feedUrl, 10)).items).toEqual([
      expect.objectContaining({
        guid: 'target', content: '<div>&blank;</div>',
        xhtmlReadability: { title: false, content: false },
      }),
    ]);
    await expect(complete(new HttpRssClient())).rejects.toThrow('partial acquisition');
  });

  it.each([
    ['numeric and escaped literal', '&#65; &amp;#65;'],
    ['declared word and escaped literal', '&word; &amp;word;'],
    ['declared word and escaped less-than', '&word; &lt;'],
  ])('accepts %s per reference while preserving XHTML bytes', async (_case, body) => {
    const declaration = body.includes('&word;') ? '<!DOCTYPE feed [<!ENTITY word "Readable">]>' : '';
    respond(declaration + atom(body));
    const client = new HttpRssClient();
    const feed = await client.readFeed(feedUrl, 10);
    expect(feed.items).toEqual([expect.objectContaining({
      guid: 'target', content: `<div>${body}</div>`, contentType: 'xhtml',
      xhtmlReadability: { title: false, content: true },
    })]);
    expect((await complete(client)).items).toEqual([
      expect.objectContaining({ externalId: 'target', body: `<div>${body}</div>` }),
    ]);
  });

  it.each([
    ['declared numeric space', '<!DOCTYPE feed [<!ENTITY blank "&#32;">]>', '&blank;'],
    ['declared invisible character', '<!DOCTYPE feed [<!ENTITY blank "\u200B">]>', '&blank;'],
    ['direct numeric space', '', '&#32;'],
  ])('does not complete an invisible XHTML body with %s', async (_case, declaration, body) => {
    respond(declaration + atom(body));
    await expect(complete(new HttpRssClient())).rejects.toThrow('partial acquisition');
  });

  it('keeps a CDATA reference and escaped reference literal beside a real declared word', async () => {
    const body = '&word; <![CDATA[&word;]]> &amp;word;';
    respond('<!DOCTYPE feed [<!ENTITY word "Readable">]>' + atom(body));
    expect((await complete(new HttpRssClient())).items).toEqual([
      expect.objectContaining({ externalId: 'target', body: `<div>${body}</div>` }),
    ]);
  });

  it.each(['&unknown;', '&recursive;'])('fails closed for %s in a mixed XHTML entry', async (reference) => {
    const declaration = reference === '&recursive;'
      ? '<!DOCTYPE feed [<!ENTITY recursive "&recursive;">]>' : '';
    respond(declaration + atom(`Readable ${reference}`));
    await expect(new HttpRssClient().readFeed(feedUrl, 10)).rejects.toThrow('entity references could not be safely resolved');
    await expect(complete(new HttpRssClient())).rejects.toThrow('partial acquisition');
  });

  it.each([
    ['plain text', 'Readable summary', '<description>Readable summary</description>'],
    ['CDATA markup', '  <p>Readable summary &amp; detail</p>  ',
      '<description><![CDATA[  <p>Readable summary &amp; detail</p>  ]]></description>'],
  ])('uses the exact readable RSS %s when encoded CDATA is blank HTML', async (_case, summary, description) => {
    const xml = '<rss><channel><item><guid>target</guid><link>https://example.test/target</link>' +
      '<content:encoded><![CDATA[<p> </p>]]></content:encoded>' +
      description +
      '<pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>';
    respond(xml);
    expect((await new HttpRssClient().readFeed(feedUrl, 10)).items).toEqual([
      expect.objectContaining({ guid: 'target', content: summary }),
    ]);
    expect((await complete(new HttpRssClient())).items).toEqual([
      expect.objectContaining({ externalId: 'target', body: summary }),
    ]);
  });

  it('uses an Atom summary when XHTML primary content is whitespace', async () => {
    respond('<feed><entry><id>target</id><link href="https://example.test/target"/>' +
      '<content type="xhtml"><div>&#32;</div></content>' +
      '<summary type="text">Readable summary</summary>' +
      '<published>2026-06-05T10:30:00Z</published></entry></feed>');
    expect((await complete(new HttpRssClient())).items).toEqual([
      expect.objectContaining({ externalId: 'target', body: 'Readable summary' }),
    ]);
  });

  it('keeps a mixed RSS feed incomplete when one dated item has only blank encoded content', async () => {
    respond('<rss><channel><item><guid>blank</guid><link>https://example.test/blank</link>' +
      '<content:encoded><![CDATA[<p> </p>]]></content:encoded>' +
      '<pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item>' +
      '<item><guid>valid</guid><link>https://example.test/valid</link>' +
      '<description>Readable summary</description>' +
      '<pubDate>Fri, 05 Jun 2026 10:30:00 GMT</pubDate></item></channel></rss>');
    const provider = new RssSourceProvider(new HttpRssClient());
    const plan = provider.planScan({ mode: 'url', query: feedUrl }, context);
    const result = await provider.scan(plan, context);
    expect(result.items.map((item) => item.externalId)).toEqual(['valid']);
    expect(result.warnings).toEqual([expect.stringContaining('no readable title or content')]);
    await expect(complete(new HttpRssClient())).rejects.toThrow('partial acquisition');
  });

  it('keeps a custom client incomplete decision for unreadable content', async () => {
    const client = { async readFeed() { return { items: [{
      guid: 'target', link: 'https://example.test/target', content: '<p> </p>',
      publishedAt: new Date('2026-06-05T10:30:00Z'),
    }] }; } } satisfies RssClientPort;
    await expect(complete(client)).rejects.toThrow('partial acquisition');
  });
});
