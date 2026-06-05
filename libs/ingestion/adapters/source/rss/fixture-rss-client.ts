import type { RssClientPort, RssFeedItem } from './rss-client.port';

const fixtureItems: readonly RssFeedItem[] = [
  {
    guid: 'rss-guid-1',
    link: 'https://example.test/rss/item-1',
    title: 'RSS item 1',
    content: 'First RSS item',
    author: 'rss-author',
    publishedAt: new Date('2026-06-05T10:00:00.000Z'),
  },
  {
    link: 'https://example.test/rss/item-2',
    title: 'RSS item 2 without guid',
    content: 'Second RSS item',
    publishedAt: new Date('2026-06-05T10:01:00.000Z'),
  },
  {
    guid: 'rss-empty-title-body',
    link: 'https://example.test/rss/empty',
  },
];

export class FixtureRssClient implements RssClientPort {
  async readFeed(_feedUrl: string, limit: number): Promise<readonly RssFeedItem[]> {
    return fixtureItems.slice(0, limit);
  }
}
