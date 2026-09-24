import { HttpRssClient } from './http-rss-client';

describe('HttpRssClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses RSS items and sends conditional HTTP headers', async () => {
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual(
        expect.objectContaining({
          'if-none-match': '"old-etag"',
          'if-modified-since': 'Fri, 05 Jun 2026 09:00:00 GMT',
        }),
      );

      return new Response(
        `
        <rss version="2.0">
          <channel>
            <item>
              <guid>rss-guid-1</guid>
              <link>https://example.test/item-1</link>
              <title>RSS title</title>
              <description>RSS body</description>
              <author>rss-author</author>
              <media:thumbnail url="https://cdn.example.test/rss-thumb.jpg" />
              <media:content url="https://cdn.example.test/rss-image.jpg" type="image/jpeg" />
              <enclosure url="https://cdn.example.test/rss-video.mp4" type="video/mp4" />
              <pubDate>Fri, 05 Jun 2026 10:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>
      `,
        {
          status: 200,
          headers: {
            etag: '"new-etag"',
            'last-modified': 'Fri, 05 Jun 2026 10:01:00 GMT',
          },
        },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new HttpRssClient().readFeed(
      'https://example.test/feed.xml',
      10,
      {
        etag: '"old-etag"',
        lastModified: 'Fri, 05 Jun 2026 09:00:00 GMT',
      },
    );

    expect(result).toEqual({
      items: [
        {
          guid: 'rss-guid-1',
          link: 'https://example.test/item-1',
          title: 'RSS title',
          content: 'RSS body',
          author: 'rss-author',
          mediaThumbnailUrl: 'https://cdn.example.test/rss-thumb.jpg',
          mediaContentUrl: 'https://cdn.example.test/rss-image.jpg',
          mediaContentType: 'image/jpeg',
          enclosureUrl: 'https://cdn.example.test/rss-video.mp4',
          enclosureType: 'video/mp4',
          publishedAt: new Date('2026-06-05T10:00:00.000Z'),
        },
      ],
      etag: '"new-etag"',
      lastModified: 'Fri, 05 Jun 2026 10:01:00 GMT',
    });
  });

  it('parses Atom entries with alternate links', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(`
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>tag:example.test,2026:item-1</id>
            <link rel="alternate" href="https://example.test/atom/item-1" />
            <title>Atom title</title>
            <summary>Atom body</summary>
            <author><name>atom-author</name></author>
            <media:thumbnail url="https://cdn.example.test/atom-thumb.webp" />
            <link rel="enclosure" href="https://cdn.example.test/atom-image.webp" type="image/webp" />
            <updated>2026-06-05T10:02:00Z</updated>
          </entry>
        </feed>
      `, { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(
      new HttpRssClient().readFeed('https://example.test/atom.xml', 10),
    ).resolves.toEqual({
      items: [
        {
          guid: 'tag:example.test,2026:item-1',
          link: 'https://example.test/atom/item-1',
          title: 'Atom title',
          titleType: 'text',
          content: 'Atom body',
          contentType: 'text',
          author: 'atom-author',
          mediaThumbnailUrl: 'https://cdn.example.test/atom-thumb.webp',
          enclosureUrl: 'https://cdn.example.test/atom-image.webp',
          enclosureType: 'image/webp',
          publishedAt: new Date('2026-06-05T10:02:00.000Z'),
        },
      ],
      etag: undefined,
      lastModified: undefined,
    });
  });

  it.each([
    ['mixed content', '<p>Do <b>not</b> deploy <i>today</i>.</p>'],
    ['nested mixed content', '<p>Read <span>this <b>carefully</b> now</span>, please.</p>'],
    ['entities', '<p>Research &amp; deploy <b>only</b> after &#x41; &lt; B.</p>'],
  ])('preserves Atom XHTML %s in its original readable order', async (_kind, content) => {
    const markup = `<div xmlns="http://www.w3.org/1999/xhtml">${content}</div>`;
    const xml = `<feed><entry><id>first</id><content type="xhtml">${markup}</content></entry>` +
      '<entry><id>second</id><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">After</div></content></entry></feed>';
    globalThis.fetch = jest.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;

    const result = await new HttpRssClient().readFeed('https://example.test/atom.xml', 10);
    expect(result.items[0]).toEqual(expect.objectContaining({ guid: 'first', content: markup, contentType: 'xhtml' }));
    expect(result.items[1]).toEqual(expect.objectContaining({ guid: 'second',
      content: '<div xmlns="http://www.w3.org/1999/xhtml">After</div>', contentType: 'xhtml' }));
  });

  it('returns notModified without parsing body for HTTP 304', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(null, {
        status: 304,
        headers: { etag: '"same-etag"' },
      }),
    ) as unknown as typeof fetch;

    await expect(
      new HttpRssClient().readFeed('https://example.test/feed.xml', 10, {
        etag: '"same-etag"',
        lastModified: 'Fri, 05 Jun 2026 09:00:00 GMT',
      }),
    ).resolves.toEqual({
      items: [],
      etag: '"same-etag"',
      lastModified: 'Fri, 05 Jun 2026 09:00:00 GMT',
      notModified: true,
    });
  });

  it.each([
    ['HTML outage', '<!DOCTYPE html><html><body>Unavailable</body></html>'],
    ['non-feed XML', '<status><message>Unavailable</message></status>'],
    ['missing RSS channel', '<rss version="2.0"/>'],
    ['broken XML', '<rss><channel><item></channel></rss>'],
  ])('rejects a 200 %s response instead of treating it as empty history', async (_case, body) => {
    globalThis.fetch = jest.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    await expect(new HttpRssClient().readFeed('https://example.test/feed.xml', 10)).rejects.toThrow(/malformed XML|invalid RSS or Atom envelope/);
  });

  it.each(['<rss version="2.0"><channel/></rss>', '<feed xmlns="http://www.w3.org/2005/Atom"/>'])('accepts a valid empty RSS or Atom feed', async (body) => {
      globalThis.fetch = jest.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
      await expect(new HttpRssClient().readFeed('https://example.test/feed.xml', 10)).resolves.toEqual({
        items: [], etag: undefined, lastModified: undefined,
      });
    });

  it.each([
    ['RSS item', '<rss><channel><item/></channel></rss>'],
    ['Atom entry', '<feed><entry/></feed>'],
  ])('retains rejection evidence for an empty parsed %s', async (_kind, body) => {
    globalThis.fetch = jest.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    await expect(new HttpRssClient().readFeed('https://example.test/feed.xml', 10, {
      targetPublishedWindow: {
        startInclusive: new Date('2026-06-05T10:00:00.000Z'),
        endExclusive: new Date('2026-06-05T11:00:00.000Z'),
      },
    })).resolves.toEqual({ items: [], rejectedEntries: 1, etag: undefined, lastModified: undefined });
  });

  it('rejects redirects to private or local network URLs', async () => {
    const response = new Response('<rss />', { status: 200 });
    Object.defineProperty(response, 'url', {
      value: 'http://127.0.0.1/feed.xml',
    });
    globalThis.fetch = jest.fn(async () => response) as unknown as typeof fetch;

    await expect(
      new HttpRssClient().readFeed('https://example.test/feed.xml', 10),
    ).rejects.toThrow(
      'Feed URL redirect rejected: Feed URL must not target private or local networks.',
    );
  });

  it('filters the parsed XML by historical window before applying the item limit', async () => {
    const newer = Array.from({ length: 10 }, (_, index) =>
      `<item><guid>new-${index}</guid><link>https://example.test/new-${index}</link><title>New</title><pubDate>Wed, 23 Sep 2026 18:00:00 GMT</pubDate></item>`,
    ).join('');
    const historical = '<item><guid>in-window</guid><link>https://example.test/old</link><title>Old</title><pubDate>Wed, 23 Sep 2026 16:30:00 GMT</pubDate></item>';
    globalThis.fetch = jest.fn(async () => new Response(`<rss><channel>${newer}${historical}</channel></rss>`, { status: 200 })) as unknown as typeof fetch;
    const client = new HttpRssClient();
    const options = { targetPublishedWindow: {
      startInclusive: new Date('2026-09-23T16:00:00.000Z'),
      endExclusive: new Date('2026-09-23T17:00:00.000Z'),
    } };
    const read = await client.readFeed('https://example.test/feed.xml', 10, options);
    expect(read.items.map((item) => item.guid)).toEqual(['in-window']);
    expect(read.truncated).toBeUndefined();

    const overflow = await client.readFeed('https://example.test/feed.xml', 1, {
      targetPublishedWindow: { startInclusive: options.targetPublishedWindow.startInclusive, endExclusive: new Date('2026-09-23T19:00:00.000Z') },
    });
    expect(overflow.truncated).toBe(true);
  });
});
