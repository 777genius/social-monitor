import type {
  HackerNewsClientPort,
  HackerNewsListStoryCommentsRequest,
  HackerNewsListing,
  HackerNewsStory,
} from './hacker-news-client.port';

const fixtureStories: readonly HackerNewsStory[] = [
  {
    id: 1001,
    title: 'Show HN: Social monitoring architecture',
    url: 'https://example.test/hn/social-monitoring',
    by: 'alice',
    time: 1_780_000_000,
    score: 42,
    comments: 9,
  },
  {
    id: 1002,
    title: 'Ask HN: Reliable RSS and API ingestion',
    by: 'bob',
    time: 1_780_000_060,
    text: 'How do you build reliable social/news ingestion?',
    score: 75,
    comments: 18,
  },
  {
    id: 1003,
    title: 'Deleted story',
    deleted: true,
    time: 1_780_000_120,
  },
];

const fixtureComments: readonly HackerNewsStory[] = [
  {
    kind: 'comment',
    id: 2001,
    storyId: 1001,
    parentId: 1001,
    storyTitle: 'Show HN: Social monitoring architecture',
    by: 'carol',
    time: 1_780_000_090,
    text: 'This monitoring approach would be useful for developer tools launches.',
    depth: 0,
    rank: 1,
  },
  {
    kind: 'comment',
    id: 2002,
    storyId: 1002,
    parentId: 1002,
    storyTitle: 'Ask HN: Reliable RSS and API ingestion',
    by: 'dave',
    time: 1_780_000_150,
    text: 'The hard part is comment-level evidence and deduping by source.',
    depth: 0,
    rank: 1,
  },
];

export class FixtureHackerNewsClient implements HackerNewsClientPort {
  async searchStories(_query: string, limit: number): Promise<readonly HackerNewsStory[]> {
    return fixtureStories.slice(0, limit);
  }

  async searchComments(_query: string, limit: number): Promise<readonly HackerNewsStory[]> {
    return fixtureComments.slice(0, limit);
  }

  async getStory(id: number): Promise<HackerNewsStory | null> {
    return fixtureStories.find((story) => story.id === id) ?? null;
  }

  async listStoryComments(
    request: HackerNewsListStoryCommentsRequest,
  ): Promise<readonly HackerNewsStory[]> {
    return fixtureComments
      .filter((comment) => comment.storyId === request.storyId)
      .filter((comment) => (comment.depth ?? 0) <= request.depth)
      .slice(0, request.limit);
  }

  async listStories(_listing: HackerNewsListing, limit: number): Promise<readonly HackerNewsStory[]> {
    return fixtureStories.slice(0, limit);
  }
}
