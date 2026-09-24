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

  it('refuses historical comment expansion when a local limit or depth hides children', async () => {
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      const id = Number(rawUrl.match(/item\/(\d+)\.json$/u)?.[1]);
      return jsonResponse({
        1: { id: 1, type: 'story', kids: [2, 3] },
        2: { id: 2, type: 'comment', parent: 1, kids: [4], time: 1_782_230_000, text: 'child' },
        3: { id: 3, type: 'comment', parent: 1, time: 1_782_230_001, text: 'sibling' },
        4: { id: 4, type: 'comment', parent: 2, time: 1_782_230_002, text: 'reply' },
      }[id]);
    }) as unknown as typeof fetch;
    const client = new HttpHackerNewsClient();
    await expect(client.listStoryComments({ storyId: 1, limit: 1, depth: 2, requireComplete: true }))
      .rejects.toThrow('comment limit');
    await expect(client.listStoryComments({ storyId: 1, limit: 10, depth: 0, requireComplete: true }))
      .rejects.toThrow('depth limit');
  });

  it.each([
    { label: 'unknown Firebase coverage', root: { id: 1, type: 'story' },
      expectedComments: undefined, reason: 'child coverage unknown' },
    { label: 'Algolia count conflicts with missing Firebase detail', root: { id: 1, type: 'story' },
      expectedComments: 1, reason: 'children unavailable' },
    { label: 'Algolia count conflicts with Firebase zero', root: { id: 1, type: 'story', descendants: 0 },
      expectedComments: 1, reason: 'children unavailable' },
    { label: 'Algolia count conflicts with empty Firebase kids', root: { id: 1, type: 'story', kids: [] },
      expectedComments: 1, reason: 'children unavailable' },
  ])('refuses historical expansion with $label', async ({ root, expectedComments, reason }) => {
    globalThis.fetch = jest.fn(async () => jsonResponse(root)) as unknown as typeof fetch;
    const client = new HttpHackerNewsClient();

    await expect(client.listStoryComments({ storyId: 1, limit: 10, depth: 2,
      expectedComments, requireComplete: true })).rejects.toThrow(reason);
    await expect(client.listStoryComments({ storyId: 1, limit: 10, depth: 2,
      expectedComments })).resolves.toEqual([]);
  });

  it('accepts confirmed Firebase zero during historical expansion', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({ id: 1, type: 'story', descendants: 0 })) as unknown as typeof fetch;
    await expect(new HttpHackerNewsClient().listStoryComments({
      storyId: 1, limit: 10, depth: 2, requireComplete: true,
    })).resolves.toEqual([]);
  });

  it('refuses historical expansion when fewer children are found than Algolia reported', async () => {
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      const id = Number(rawUrl.match(/item\/(\d+)\.json$/u)?.[1]);
      return jsonResponse(id === 1
        ? { id: 1, type: 'story', kids: [2] }
        : { id: 2, type: 'comment', parent: 1, time: 1_782_230_000, text: 'Synthetic comment' });
    }) as unknown as typeof fetch;

    await expect(new HttpHackerNewsClient().listStoryComments({
      storyId: 1, limit: 10, depth: 2, expectedComments: 2, requireComplete: true,
    })).rejects.toThrow('fewer children than expected count');
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
        numericFilters: 'created_at_i>1782229999,created_at_i<1782316400',
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

  it('requests an inclusive start and exclusive end at whole and fractional seconds', async () => {
    const urls: URL[] = [];
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      urls.push(new URL(rawUrl));
      return jsonResponse({ hits: [] });
    }) as unknown as typeof fetch;
    const client = new HttpHackerNewsClient();
    await client.searchStories('boundary', 10, {
      from: new Date('2026-09-23T16:00:00.000Z'),
      to: new Date('2026-09-23T17:00:00.000Z'),
    });
    await client.searchStories('boundary', 10, {
      from: new Date('2026-09-23T16:00:00.500Z'),
      to: new Date('2026-09-23T17:00:00.500Z'),
    });
    const start = Date.parse('2026-09-23T16:00:00.000Z') / 1000;
    const end = Date.parse('2026-09-23T17:00:00.000Z') / 1000;
    expect(urls.map((url) => url.searchParams.get('numericFilters'))).toEqual([
      `created_at_i>${start - 1},created_at_i<${end}`,
      `created_at_i>${start},created_at_i<${end + 1}`,
    ]);
  });

  it('assigns exact-second hits to only the adjacent recovery window that starts there', async () => {
    const boundary = Date.parse('2026-09-23T17:00:00.000Z') / 1000;
    const hits = [
      { objectID: '501', title: 'Boundary story before', created_at_i: boundary - 1, points: 4 },
      { objectID: '502', title: 'Boundary story exact', created_at_i: boundary, points: 4 },
    ];
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      const filters = new URL(rawUrl).searchParams.get('numericFilters') ?? '';
      const from = Number(filters.match(/created_at_i>(\d+)/u)?.[1]);
      const to = Number(filters.match(/created_at_i<(\d+)/u)?.[1]);
      return jsonResponse({ hits: hits.filter((hit) => hit.created_at_i > from && hit.created_at_i < to) });
    }) as unknown as typeof fetch;
    const client = new HttpHackerNewsClient();
    const before = await client.searchStories('boundary', 10, {
      from: new Date('2026-09-23T16:00:00.000Z'), to: new Date('2026-09-23T17:00:00.000Z'),
    });
    const after = await client.searchStories('boundary', 10, {
      from: new Date('2026-09-23T17:00:00.000Z'), to: new Date('2026-09-23T18:00:00.000Z'),
    });
    expect(before.map((story) => story.id)).toEqual([501]);
    expect(after.map((story) => story.id)).toEqual([502]);
  });

  it('exhausts historical pages, preserving the eleventh hit beyond maxItems', async () => {
    const start = Date.parse('2026-09-23T16:00:00Z') / 1000;
    const hits = Array.from({ length: 101 }, (_, index) => ({
      objectID: String(1000 + index), title: 'Boundary story', created_at_i: start + index, points: 4,
    }));
    const requested: number[] = [];
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      const url = new URL(rawUrl);
      const page = Number(url.searchParams.get('page'));
      requested.push(page);
      return jsonResponse({ hits: hits.slice(page * 100, (page + 1) * 100),
        nbHits: 101, nbPages: 2, page, exhaustiveNbHits: true });
    }) as unknown as typeof fetch;
    const result = await new HttpHackerNewsClient().searchStories('boundary', 10, {
      from: new Date('2026-09-23T16:00:00Z'), to: new Date('2026-09-23T17:00:00Z'), requireComplete: true,
    });
    expect(result).toHaveLength(101);
    expect(result.at(-1)?.id).toBe(1100);
    expect(requested).toEqual([0, 1]);
  });

  it('subdivides a capped interval into disjoint seconds', async () => {
    const start = Date.parse('2026-09-23T16:00:00Z') / 1000;
    const seen: string[] = [];
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      const filters = new URL(rawUrl).searchParams.get('numericFilters') ?? '';
      seen.push(filters);
      const lower = Number(filters.match(/created_at_i>(\d+)/u)?.[1]) + 1;
      const upper = Number(filters.match(/created_at_i<(\d+)/u)?.[1]);
      if (upper - lower > 1) return jsonResponse({ hits: [], nbHits: 1001, nbPages: 11, page: 0, exhaustiveNbHits: true });
      return jsonResponse({ hits: [{ objectID: String(lower), title: 'Boundary', created_at_i: lower, points: 4 }],
        nbHits: 1, nbPages: 1, page: 0, exhaustiveNbHits: true });
    }) as unknown as typeof fetch;
    const result = await new HttpHackerNewsClient().searchStories('boundary', 1, {
      from: new Date(start * 1000), to: new Date((start + 2) * 1000), requireComplete: true,
    });
    expect(result.map((story) => story.id)).toEqual([start, start + 1]);
    expect(seen).toHaveLength(3);
  });

  it('rejects unknown counts, duplicate pages, provider errors and unsplittable ceilings', async () => {
    const start = Date.parse('2026-09-23T16:00:00Z') / 1000;
    const options = { from: new Date(start * 1000), to: new Date((start + 1) * 1000), requireComplete: true };
    const client = new HttpHackerNewsClient();
    globalThis.fetch = jest.fn(async () => jsonResponse({ hits: [], nbHits: 0, nbPages: 0, page: 0 })) as unknown as typeof fetch;
    await expect(client.searchStories('boundary', 10, options)).rejects.toThrow('unknown Algolia coverage');
    globalThis.fetch = jest.fn(async () => jsonResponse({ hits: [], nbHits: 1001, nbPages: 11, page: 0, exhaustiveNbHits: true })) as unknown as typeof fetch;
    await expect(client.searchStories('boundary', 10, options)).rejects.toThrow('provider pagination ceiling');
    globalThis.fetch = jest.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(client.searchStories('boundary', 10, options)).rejects.toThrow('HTTP 503');
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      const page = Number(new URL(rawUrl).searchParams.get('page'));
      if (page === 1) return new Response('', { status: 503 });
      return jsonResponse({ hits: Array.from({ length: 100 }, (_, index) => ({
        objectID: String(index + 1), title: 'Boundary', created_at_i: start, points: 4,
      })), nbHits: 101, nbPages: 2, page: 0, exhaustiveNbHits: true });
    }) as unknown as typeof fetch;
    await expect(client.searchStories('boundary', 10, options)).rejects.toThrow('HTTP 503');
    globalThis.fetch = jest.fn(async (rawUrl: string) => {
      const page = Number(new URL(rawUrl).searchParams.get('page'));
      const hit = { objectID: '1', title: 'Boundary', created_at_i: start, points: 4 };
      return jsonResponse({ hits: page === 0 ? Array.from({ length: 100 }, () => hit) : [hit],
        nbHits: 101, nbPages: 2, page, exhaustiveNbHits: true });
    }) as unknown as typeof fetch;
    await expect(client.searchStories('boundary', 10, options)).rejects.toThrow('duplicate');
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
