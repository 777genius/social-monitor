import type { HackerNewsClientPort, HackerNewsListing, HackerNewsStory } from './hacker-news-client.port';

const fixtureStories: readonly HackerNewsStory[] = [
  {
    id: 1001,
    title: 'Show HN: Social monitoring architecture',
    url: 'https://example.test/hn/social-monitoring',
    by: 'alice',
    time: 1_780_000_000,
  },
  {
    id: 1002,
    title: 'Ask HN: Reliable RSS and API ingestion',
    by: 'bob',
    time: 1_780_000_060,
    text: 'How do you build reliable social/news ingestion?',
  },
  {
    id: 1003,
    title: 'Deleted story',
    deleted: true,
    time: 1_780_000_120,
  },
];

export class FixtureHackerNewsClient implements HackerNewsClientPort {
  async searchStories(_query: string, limit: number): Promise<readonly HackerNewsStory[]> {
    return fixtureStories.slice(0, limit);
  }

  async listStories(_listing: HackerNewsListing, limit: number): Promise<readonly HackerNewsStory[]> {
    return fixtureStories.slice(0, limit);
  }
}
