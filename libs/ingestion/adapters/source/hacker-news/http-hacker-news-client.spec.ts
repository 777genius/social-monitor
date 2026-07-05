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

  it('fetches bounded HN Firebase comments by story id, limit and depth', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = jest.fn(async (url: string) => {
      requestedUrls.push(url);
      const id = Number(url.match(/item\/(\d+)\.json$/u)?.[1]);

      return jsonResponse({
        48658000: {
          id: 48658000,
          type: 'story',
          title: 'Ask HN: Agent monitoring in production',
          kids: [48658001, 48658002],
        },
        48658001: {
          id: 48658001,
          type: 'comment',
          parent: 48658000,
          kids: [48658003],
          by: 'parent-commenter',
          time: 1_782_230_010,
          text: '<p>Parent comment &amp; context.</p>',
        },
        48658002: {
          id: 48658002,
          type: 'comment',
          parent: 48658000,
          by: 'second-commenter',
          time: 1_782_230_020,
          text: 'Second top-level comment.',
        },
        48658003: {
          id: 48658003,
          type: 'comment',
          parent: 48658001,
          by: 'reply-commenter',
          time: 1_782_230_030,
          text: 'Reply comment.',
        },
      }[id]);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      new HttpHackerNewsClient().listStoryComments({
        storyId: 48658000,
        limit: 2,
        depth: 1,
      }),
    ).resolves.toEqual([
      {
        kind: 'comment',
        id: 48658001,
        parentId: 48658000,
        kids: [48658003],
        storyId: 48658000,
        depth: 0,
        rank: 1,
        by: 'parent-commenter',
        time: 1_782_230_010,
        text: 'Parent comment & context.',
        deleted: false,
        dead: false,
      },
      {
        kind: 'comment',
        id: 48658003,
        parentId: 48658001,
        storyId: 48658000,
        depth: 1,
        rank: 2,
        by: 'reply-commenter',
        time: 1_782_230_030,
        text: 'Reply comment.',
        deleted: false,
        dead: false,
      },
    ]);
    expect(requestedUrls).toEqual([
      'https://hacker-news.firebaseio.com/v0/item/48658000.json',
      'https://hacker-news.firebaseio.com/v0/item/48658001.json',
      'https://hacker-news.firebaseio.com/v0/item/48658003.json',
    ]);
  });

  it('maps HN Algolia hit points and num_comments into story metrics', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expectAlgoliaSearchUrl(url, {
        query: 'social monitor',
        tags: 'story',
        hitsPerPage: '2',
        optionalWords: 'monitor',
      });
      expect(init?.headers).toEqual(expect.objectContaining({
        accept: 'application/json',
        'user-agent': 'social-monitor-mvp/0.1',
      }));

      return jsonResponse({
        hits: [
          {
            objectID: '48656893',
            title: 'Show HN: Social Monitor preview',
            points: 1,
          },
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
      kind: 'story',
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

  it('maps HN Algolia comment hits into comment items', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expectAlgoliaSearchUrl(url, {
        query: 'agent monitoring',
        tags: 'comment',
        hitsPerPage: '4',
        optionalWords: 'monitoring',
      });
      expect(init?.headers).toEqual(expect.objectContaining({
        accept: 'application/json',
        'user-agent': 'social-monitor-mvp/0.1',
      }));

      return jsonResponse({
        hits: [
          {
            objectID: '48656901',
            story_id: 48656894,
            parent_id: 48656894,
            story_title: 'Show HN: Social Monitor',
            author: 'carol',
            created_at_i: 1_782_230_200,
            comment_text: '<p>Agent monitoring signals &amp; replies are more actionable.<br>Use them.</p>',
          },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().searchComments('agent monitoring', 2)).resolves.toEqual([{
      kind: 'comment',
      id: 48656901,
      storyTitle: 'Show HN: Social Monitor',
      storyId: 48656894,
      parentId: 48656894,
      by: 'carol',
      time: 1_782_230_200,
      text: 'Agent monitoring signals & replies are more actionable.\nUse them.',
    }]);
  });

  it('flattens Algolia queries and marks later tokens optional for multi-word discovery', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expectAlgoliaSearchUrl(url, {
        query: 'ts bun node',
        tags: 'story',
        hitsPerPage: '6',
        optionalWords: 'bun node',
      });

      return jsonResponse({
        hits: [
          {
            objectID: '48657001',
            title: 'Bun and Node runtime notes',
            created_at_i: 1_782_230_300,
            points: 12,
          },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().searchStories('ts-bun,node', 3)).resolves.toEqual([{
      kind: 'story',
      id: 48657001,
      title: 'Bun and Node runtime notes',
      time: 1_782_230_300,
      score: 12,
    }]);
  });

  it('uses Algolia date filters without adding unsupported points filters', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expectAlgoliaSearchUrl(url, {
        query: 'ai agents',
        tags: 'story',
        hitsPerPage: '20',
        optionalWords: 'agents',
        numericFilters: 'created_at_i>1782230000,created_at_i<1782316400',
      });
      expect(new URL(url).searchParams.get('numericFilters')).not.toContain('points');

      return jsonResponse({ hits: [] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await new HttpHackerNewsClient().searchStories('ai agents', 10, {
      from: new Date(1_782_230_000 * 1000),
      to: new Date(1_782_316_400 * 1000),
    });
  });

  it('drops HN prefix-only false positives while keeping body matches', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({
      hits: [
        {
          objectID: '48657101',
          title: 'Show HN: Email client',
          points: 50,
        },
        {
          objectID: '48657102',
          title: 'Show HN: AI client',
          points: 10,
        },
        {
          objectID: '48657103',
          title: 'Show HN: Local model runner',
          story_text: '<p>AI inference on developer laptops.</p>',
          points: 8,
        },
      ],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().searchStories('ai', 10)).resolves.toEqual([
      {
        kind: 'story',
        id: 48657102,
        title: 'Show HN: AI client',
        score: 10,
      },
      {
        kind: 'story',
        id: 48657103,
        title: 'Show HN: Local model runner',
        text: 'AI inference on developer laptops.',
        score: 8,
      },
    ]);
  });

  it('keeps explicit Show HN discovery queries as prefix matches', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({
      hits: [
        {
          objectID: '48657110',
          title: 'Show HN: Tiny developer tool',
          points: 4,
        },
      ],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().searchStories('Show HN', 10)).resolves.toEqual([
      {
        kind: 'story',
        id: 48657110,
        title: 'Show HN: Tiny developer tool',
        score: 4,
      },
    ]);
  });

  it('filters explicit Show HN topic queries by topic words instead of the prefix', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({
      hits: [
        {
          objectID: '48657111',
          title: 'Show HN: Tiny developer tool',
          points: 4,
        },
        {
          objectID: '48657112',
          title: 'Show HN: AI developer tool',
          points: 5,
        },
      ],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().searchStories('Show HN AI', 10)).resolves.toEqual([
      {
        kind: 'story',
        id: 48657112,
        title: 'Show HN: AI developer tool',
        score: 5,
      },
    ]);
  });

  it('requires stronger token overlap for broad technical queries when precise hits exist', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({
      hits: [
        {
          objectID: '48657121',
          title: 'AI email client',
          points: 20,
        },
        {
          objectID: '48657122',
          title: 'Claude Code MCP workflows for AI agents',
          points: 12,
        },
      ],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      new HttpHackerNewsClient().searchStories('AI agents MCP Claude Code', 10),
    ).resolves.toEqual([
      {
        kind: 'story',
        id: 48657122,
        title: 'Claude Code MCP workflows for AI agents',
        score: 12,
      },
    ]);
  });

  it('falls back to loose token matches when broad-query precision would return no hits', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({
      hits: [
        {
          objectID: '48657123',
          title: 'MCP server patterns',
          points: 6,
        },
      ],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      new HttpHackerNewsClient().searchStories('AI agents MCP Claude Code', 10),
    ).resolves.toEqual([
      {
        kind: 'story',
        id: 48657123,
        title: 'MCP server patterns',
        score: 6,
      },
    ]);
  });

  it('falls back to low-engagement story hits when every matching Algolia hit is new', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({
      hits: [
        {
          objectID: '48657201',
          title: 'Early launch discussion',
          points: 1,
        },
        {
          objectID: '48657202',
          title: 'Early launch follow-up',
          points: 2,
        },
      ],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().searchStories('early launch', 2)).resolves.toEqual([
      {
        kind: 'story',
        id: 48657201,
        title: 'Early launch discussion',
        score: 1,
      },
      {
        kind: 'story',
        id: 48657202,
        title: 'Early launch follow-up',
        score: 2,
      },
    ]);
  });
});

const expectAlgoliaSearchUrl = (
  rawUrl: string,
  expected: Readonly<Record<string, string>>,
): void => {
  const url = new URL(rawUrl);
  expect(url.origin + url.pathname).toBe('https://hn.algolia.com/api/v1/search_by_date');

  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
};

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
