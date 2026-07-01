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
          content: 'Atom body',
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
});
