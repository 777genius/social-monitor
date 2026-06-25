import { HttpRedditClient } from './http-reddit-client';

describe('HttpRedditClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps Reddit listing JSON engagement fields and skips children without stable ids', async () => {
    const fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth.reddit.test/r/ClaudeAI/top?limit=2&t=week');
      expect(init?.headers).toEqual(expect.objectContaining({
        authorization: 'Bearer token-value',
        accept: 'application/json',
        'user-agent': 'social-monitor-test/0.1',
      }));

      return new Response(JSON.stringify({
        data: {
          after: 't3_after',
          children: [
            {
              data: {
                id: 'post_1',
                name: 't3_post_1',
                subreddit: 'ClaudeAI',
                title: '  Release discussion  ',
                selftext: '  Users compare coding workflows.  ',
                author: 'example-user',
                permalink: '/r/ClaudeAI/comments/post_1/release_discussion/',
                url: 'https://example.test/release-discussion',
                created_utc: 1_782_230_000,
                over_18: false,
                stickied: false,
                score: 420,
                num_comments: 58,
                upvote_ratio: 0.94,
              },
            },
            {
              data: {
                title: 'Missing id is not a stable source item',
                score: 1000,
              },
            },
          ],
        },
      }), {
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const page = await new HttpRedditClient('https://oauth.reddit.test').listSubredditPosts({
      accessToken: 'token-value',
      userAgent: 'social-monitor-test/0.1',
      subreddit: 'ClaudeAI',
      listing: 'top',
      topTime: 'week',
      limit: 2,
    });

    expect(page).toEqual({
      after: 't3_after',
      posts: [{
        id: 'post_1',
        name: 't3_post_1',
        subreddit: 'ClaudeAI',
        title: 'Release discussion',
        selftext: 'Users compare coding workflows.',
        author: 'example-user',
        permalink: '/r/ClaudeAI/comments/post_1/release_discussion/',
        url: 'https://example.test/release-discussion',
        createdUtc: 1_782_230_000,
        over18: false,
        stickied: false,
        removedByCategory: undefined,
        score: 420,
        numComments: 58,
        upvoteRatio: 0.94,
      }],
    });
  });

  it('maps Reddit search JSON with negative score and default user agent', async () => {
    const fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth.reddit.test/search?q=agent+feedback&type=link&sort=new&limit=1');
      expect(init?.headers).toEqual(expect.objectContaining({
        authorization: 'Bearer token-value',
        'user-agent': 'social-monitor-mvp/0.1',
      }));

      return new Response(JSON.stringify({
        data: {
          children: [{
            data: {
              id: 'post_2',
              subreddit: 'SmallSub',
              title: 'Downvoted but still visible',
              score: -3,
              num_comments: 2,
              upvote_ratio: 0.41,
            },
          }],
        },
      }), {
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpRedditClient('https://oauth.reddit.test').searchPosts({
      accessToken: 'token-value',
      query: 'agent feedback',
      limit: 1,
    })).resolves.toMatchObject({
      posts: [{
        id: 'post_2',
        subreddit: 'SmallSub',
        score: -3,
        numComments: 2,
        upvoteRatio: 0.41,
      }],
    });
  });
});
