import { HttpRedditClient } from './http-reddit-client';

describe('HttpRedditClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps Reddit listing JSON engagement fields and skips children without stable ids', async () => {
    const fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth.reddit.test/r/ClaudeAI/top?limit=2&t=week&raw_json=1');
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
                thumbnail: 'https://b.thumbs.redditmedia.com/thumb.jpg',
                preview: {
                  images: [{
                    source: {
                      url: 'https://preview.redd.it/release.png?width=1200&amp;format=png',
                    },
                  }],
                },
                post_hint: 'image',
                is_video: false,
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
        headers: {
          'x-ratelimit-used': '1',
          'x-ratelimit-remaining': '99',
          'x-ratelimit-reset': '60',
        },
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
        thumbnailUrl: 'https://b.thumbs.redditmedia.com/thumb.jpg',
        previewImageUrl: 'https://preview.redd.it/release.png?width=1200&format=png',
        postHint: 'image',
        isVideo: false,
        createdUtc: 1_782_230_000,
        over18: false,
        stickied: false,
        removedByCategory: undefined,
        score: 420,
        numComments: 58,
        upvoteRatio: 0.94,
      }],
      rateLimit: {
        headersObserved: true,
        used: '1',
        remaining: '99',
        reset: '60',
      },
    });
  });

  it('maps Reddit search JSON with negative score and default user agent', async () => {
    const fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth.reddit.test/search?q=agent+feedback&type=link&sort=new&limit=1&raw_json=1');
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

  it('maps Reddit thread comments including nested replies', async () => {
    const fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth.reddit.test/r/ClaudeAI/comments/post_1?limit=2&sort=confidence');
      expect(init?.headers).toEqual(expect.objectContaining({
        authorization: 'Bearer token-value',
        accept: 'application/json',
        'user-agent': 'social-monitor-test/0.1',
      }));

      return new Response(JSON.stringify([
        { data: { children: [] } },
        {
          data: {
            children: [
              {
                data: {
                  id: 'comment_1',
                  name: 't1_comment_1',
                  subreddit: 'ClaudeAI',
                  body: '  Users explain why comment-level evidence matters.  ',
                  author: 'example-commenter',
                  permalink: '/r/ClaudeAI/comments/post_1/_/comment_1/',
                  parent_id: 't3_post_1',
                  created_utc: 1_782_230_060,
                  score: 25,
                  removed_by_category: null,
                  depth: 0,
                  replies: {
                    data: {
                      children: [
                        {
                          kind: 't1',
                          data: {
                            id: 'reply_1',
                            name: 't1_reply_1',
                            subreddit: 'ClaudeAI',
                            body: 'Nested replies should stay attached to the same evidence stream.',
                            author: 'nested-user',
                            permalink: '/r/ClaudeAI/comments/post_1/_/reply_1/',
                            parent_id: 't1_comment_1',
                            created_utc: 1_782_230_090,
                            score: 8,
                            depth: 1,
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                data: {
                  body: 'Missing id is not a stable source item',
                },
              },
            ],
          },
        },
      ]), {
        status: 200,
        headers: {
          'x-ratelimit-used': '2',
          'x-ratelimit-remaining': '98',
          'x-ratelimit-reset': '55',
        },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const page = await new HttpRedditClient('https://oauth.reddit.test').listPostComments({
      accessToken: 'token-value',
      userAgent: 'social-monitor-test/0.1',
      subreddit: 'ClaudeAI',
      postId: 'post_1',
      limit: 2,
    });

    expect(page).toEqual({
      comments: [
        {
          id: 'comment_1',
          name: 't1_comment_1',
          subreddit: 'ClaudeAI',
          body: 'Users explain why comment-level evidence matters.',
          author: 'example-commenter',
          permalink: '/r/ClaudeAI/comments/post_1/_/comment_1/',
          parentId: 't3_post_1',
          createdUtc: 1_782_230_060,
          score: 25,
          replyCount: 1,
          removedByCategory: undefined,
          depth: 0,
        },
        {
          id: 'reply_1',
          name: 't1_reply_1',
          subreddit: 'ClaudeAI',
          body: 'Nested replies should stay attached to the same evidence stream.',
          author: 'nested-user',
          permalink: '/r/ClaudeAI/comments/post_1/_/reply_1/',
          parentId: 't1_comment_1',
          createdUtc: 1_782_230_090,
          score: 8,
          replyCount: 0,
          removedByCategory: undefined,
          depth: 1,
        },
      ],
      rateLimit: {
        headersObserved: true,
        used: '2',
        remaining: '98',
        reset: '55',
      },
    });
  });
});
