import { HttpHackerNewsClient } from './http-hacker-news-client';

describe('HttpHackerNewsClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps HN Firebase story score and descendants into points and comments', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url === 'https://hacker-news.firebaseio.com/v0/topstories.json') {
        return jsonResponse([48653216, 'bad-id']);
      }

      expect(url).toBe('https://hacker-news.firebaseio.com/v0/item/48653216.json');

      return jsonResponse({
        id: 48653216,
        title: 'Launch HN: Provider-aware signal',
        url: 'https://example.test/provider-aware-signal',
        by: 'alice',
        time: 1_782_230_000,
        text: 'Discussion text',
        score: 243,
        descendants: 133,
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().listStories('top', 2)).resolves.toEqual([{
      id: 48653216,
      title: 'Launch HN: Provider-aware signal',
      url: 'https://example.test/provider-aware-signal',
      by: 'alice',
      time: 1_782_230_000,
      text: 'Discussion text',
      score: 243,
      comments: 133,
      deleted: false,
      dead: false,
    }]);
  });

  it('maps HN Algolia hit points and num_comments into story metrics', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        'https://hn.algolia.com/api/v1/search_by_date?query=social+monitor&tags=story&hitsPerPage=1',
      );
      expect(init?.headers).toEqual(expect.objectContaining({
        accept: 'application/json',
        'user-agent': 'social-monitor-mvp/0.1',
      }));

      return jsonResponse({
        hits: [
          {
            objectID: '48656894',
            title: 'Show HN: Social Monitor',
            url: 'https://example.test/social-monitor',
            author: 'bob',
            created_at_i: 1_782_230_100,
            story_text: 'Project text',
            points: 64,
            num_comments: 18,
          },
          {
            objectID: 'not-a-number',
            title: 'Invalid hit',
            points: 1000,
          },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().searchStories('social monitor', 1)).resolves.toEqual([{
      id: 48656894,
      title: 'Show HN: Social Monitor',
      url: 'https://example.test/social-monitor',
      by: 'bob',
      time: 1_782_230_100,
      text: 'Project text',
      score: 64,
      comments: 18,
    }]);
  });
});

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
