import { HttpHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { HttpRssClient } from '../libs/ingestion/adapters/source/rss/http-rss-client';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const hackerNews = new HttpHackerNewsClient(10_000);
  const [topStories, searchStories] = await Promise.all([
    hackerNews.listStories('top', 2),
    hackerNews.searchStories('monitoring', 2),
  ]);

  assert(topStories.length > 0, 'Hacker News top listing must return at least one story');
  assert(searchStories.length > 0, 'Hacker News search must return at least one story');
  assert(
    topStories.every((story) => Number.isInteger(story.id)),
    'Hacker News listing stories must include stable numeric ids',
  );

  const rss = await new HttpRssClient(10_000).readFeed('https://hnrss.org/frontpage', 2);
  assert(rss.items.length > 0, 'HNRSS frontpage feed must return at least one RSS item');
  assert(
    rss.items.some((item) => (item.title ?? '').trim().length > 0 || (item.content ?? '').trim().length > 0),
    'HNRSS frontpage feed must include readable title or content',
  );

  console.log([
    'Live open connector smoke OK',
    `HN top stories: ${topStories.length}`,
    `HN search stories: ${searchStories.length}`,
    `RSS items: ${rss.items.length}`,
  ].join('\n'));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
