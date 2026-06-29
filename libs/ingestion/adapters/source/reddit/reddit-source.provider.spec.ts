import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SourceProviderScanContext, SourceRuntimeConfig } from '../../../ports';
import type { RedditClientPort, RedditListingPage, RedditListSubredditPostsRequest, RedditSearchPostsRequest } from './reddit-client.port';
import { RedditSourceProvider } from './reddit-source.provider';
import type { RedditRefreshTokenProviderPort, RedditRefreshTokenRequest } from './refresh-token-reddit-token-provider';
import type { RedditTokenProviderPort } from './reddit-token-provider.port';

describe('RedditSourceProvider', () => {
  it('uses app-only OAuth when the source binding has no user token', async () => {
    const client = new CapturingRedditClient();
    const provider = new RedditSourceProvider(client, new StaticTokenProvider('reddit-app-only-token'));
    const context = scanContext({
      subreddit: 'observability',
      listing: 'hot',
    });
    const plan = provider.planScan({ mode: 'listing', query: 'observability:hot' }, context);

    await provider.scan(plan, context);

    expect(client.listingRequests).toHaveLength(1);
    expect(client.listingRequests[0]?.accessToken).toBe('reddit-app-only-token');
  });

  it('keeps encrypted tenant bearer tokens as an explicit override', async () => {
    const client = new CapturingRedditClient();
    const appTokenProvider = new StaticTokenProvider('reddit-app-only-token');
    const refreshTokenProvider = new StaticRefreshTokenProvider('tenant-refresh-access-token');
    const provider = new RedditSourceProvider(client, appTokenProvider, refreshTokenProvider);
    const context = scanContext({
      accessToken: 'tenant-reddit-token',
      refreshToken: 'tenant-refresh-token',
      subreddit: 'observability',
      listing: 'hot',
    });
    const plan = provider.planScan({ mode: 'listing', query: 'observability:hot' }, context);

    await provider.scan(plan, context);

    expect(appTokenProvider.calls).toBe(0);
    expect(refreshTokenProvider.requests).toHaveLength(0);
    expect(client.listingRequests[0]?.accessToken).toBe('tenant-reddit-token');
  });

  it('exchanges encrypted tenant refresh tokens before falling back to app-only OAuth', async () => {
    const client = new CapturingRedditClient();
    const appTokenProvider = new StaticTokenProvider('reddit-app-only-token');
    const refreshTokenProvider = new StaticRefreshTokenProvider('tenant-refresh-access-token');
    const provider = new RedditSourceProvider(client, appTokenProvider, refreshTokenProvider);
    const context = scanContext({
      clientId: 'reddit-client-id',
      clientSecret: 'reddit-client-secret',
      refreshToken: 'tenant-refresh-token',
      userAgent: 'social-monitor-test/0.1',
      subreddit: 'observability',
      listing: 'hot',
    });
    const plan = provider.planScan({ mode: 'listing', query: 'observability:hot' }, context);

    await provider.scan(plan, context);

    expect(appTokenProvider.calls).toBe(0);
    expect(refreshTokenProvider.requests).toEqual([{
      clientId: 'reddit-client-id',
      clientSecret: 'reddit-client-secret',
      refreshToken: 'tenant-refresh-token',
      userAgent: 'social-monitor-test/0.1',
    }]);
    expect(client.listingRequests[0]?.accessToken).toBe('tenant-refresh-access-token');
  });

  it('passes top listing time window and keeps engagement metadata', async () => {
    const client = new CapturingRedditClient({
      posts: [
        {
          id: 'post-1',
          name: 't3_post_1',
          subreddit: 'ClaudeAI',
          title: 'Claude release discussion',
          selftext: 'Users compare the release against coding workflows.',
          permalink: '/r/ClaudeAI/comments/post_1/claude_release_discussion/',
          url: 'https://example.test/claude-release-analysis',
          author: 'example-user',
          createdUtc: 1_782_230_000,
          score: 420,
          numComments: 58,
          upvoteRatio: 0.94,
        },
        {
          id: 'post-2',
          name: 't3_post_2',
          subreddit: 'ClaudeAI',
          title: 'Low signal question',
          selftext: 'No meaningful engagement yet.',
          permalink: '/r/ClaudeAI/comments/post_2/low_signal_question/',
          createdUtc: 1_782_230_100,
          score: 2,
          numComments: 0,
          upvoteRatio: 0.5,
        },
      ],
    });
    const provider = new RedditSourceProvider(client, new StaticTokenProvider('reddit-app-only-token'));
    const context = scanContext({
      subreddit: 'ClaudeAI',
      listing: 'top',
      topTime: 'week',
      minScore: 100,
      maxItems: 10,
    });
    const plan = provider.planScan({ mode: 'listing', query: 'ClaudeAI:top' }, context);

    const result = await provider.scan(plan, context);

    expect(client.listingRequests[0]).toMatchObject({
      subreddit: 'ClaudeAI',
      listing: 'top',
      topTime: 'week',
      limit: 10,
    });
    expect(result.items[0]).toMatchObject({
      title: 'Claude release discussion',
      metadata: {
        subreddit: 'ClaudeAI',
        linkedUrl: 'https://example.test/claude-release-analysis',
        score: 420,
        numComments: 58,
        upvoteRatio: 0.94,
      },
    });
    expect(result.items).toHaveLength(1);
  });

  it('runs configured multi-pass top/day listings with search fallback and engagement sorting', async () => {
    const client = new CapturingRedditClient({
      listingResponses: new Map<string, RedditListingPage | Error>([
        [
          'OpenAI:top:day',
          {
            posts: [
              redditPost({
                id: 'openai-low',
                subreddit: 'OpenAI',
                title: 'OpenAI low score discussion',
                score: 12,
                numComments: 4,
              }),
              redditPost({
                id: 'shared',
                subreddit: 'OpenAI',
                title: 'Shared OpenAI agent reliability thread',
                score: 180,
                numComments: 60,
              }),
            ],
          },
        ],
        [
          'LocalLLaMA:top:day',
          {
            posts: [
              redditPost({
                id: 'local-llama',
                subreddit: 'LocalLLaMA',
                title: 'LocalLLaMA compares new open model serving',
                score: 220,
                numComments: 90,
              }),
            ],
          },
        ],
        [
          'MachineLearning:top:day',
          {
            posts: [
              redditPost({
                id: 'machine-learning',
                subreddit: 'MachineLearning',
                title: 'MachineLearning paper discussion',
                score: 160,
                numComments: 75,
              }),
            ],
          },
        ],
      ]),
      searchResponse: {
        posts: [
          redditPost({
            id: 'shared',
            subreddit: 'OpenAI',
            title: 'Shared OpenAI agent reliability thread',
            score: 180,
            numComments: 60,
          }),
          redditPost({
            id: 'search-fallback',
            subreddit: 'ArtificialInteligence',
            title: 'AI agents search fallback thread',
            score: 80,
            numComments: 40,
          }),
        ],
      },
    });
    const provider = new RedditSourceProvider(client, new StaticTokenProvider('reddit-app-only-token'));
    const context = scanContext({
      maxItems: 3,
      scanPasses: [
        { mode: 'listing', subreddit: 'OpenAI', listing: 'top', topTime: 'day' },
        { mode: 'listing', subreddit: 'LocalLLaMA', listing: 'top', topTime: 'day' },
        { mode: 'listing', subreddit: 'MachineLearning', listing: 'top', topTime: 'day' },
        { mode: 'search', query: 'OpenAI OR LLM OR AI agents', maxItems: 2 },
      ],
    });
    const plan = provider.planScan({ mode: 'search', query: 'OpenAI OR LLM OR AI agents' }, context);

    const result = await provider.scan(plan, context);

    expect(client.listingRequests.map((request) => ({
      subreddit: request.subreddit,
      listing: request.listing,
      topTime: request.topTime,
      limit: request.limit,
    }))).toEqual([
      { subreddit: 'OpenAI', listing: 'top', topTime: 'day', limit: 1 },
      { subreddit: 'LocalLLaMA', listing: 'top', topTime: 'day', limit: 1 },
      { subreddit: 'MachineLearning', listing: 'top', topTime: 'day', limit: 1 },
    ]);
    expect(client.searchRequests).toEqual([
      expect.objectContaining({
        query: 'OpenAI OR LLM OR AI agents',
        limit: 2,
      }),
    ]);
    expect(result.nextCursor).toBeUndefined();
    expect(result.items.map((item) => item.externalId)).toEqual([
      'reddit:t3_local-llama',
      'reddit:t3_machine-learning',
      'reddit:t3_shared',
    ]);
  });

  it('keeps successful scan-pass posts when another Reddit pass is temporarily unavailable', async () => {
    const client = new CapturingRedditClient({
      listingResponses: new Map<string, RedditListingPage | Error>([
        [
          'OpenAI:top:day',
          {
            posts: [
              redditPost({
                id: 'openai-live',
                subreddit: 'OpenAI',
                title: 'OpenAI live discussion survives partial outage',
                score: 320,
                numComments: 88,
              }),
            ],
          },
        ],
        ['ClaudeAI:top:day', new Error('fetch failed')],
      ]),
      searchResponse: {
        posts: [
          redditPost({
            id: 'search-live',
            subreddit: 'ArtificialInteligence',
            title: 'AI agents search fallback survives partial outage',
            score: 120,
            numComments: 42,
          }),
        ],
      },
    });
    const provider = new RedditSourceProvider(client, new StaticTokenProvider('reddit-app-only-token'));
    const context = scanContext({
      maxItems: 5,
      scanPasses: [
        { mode: 'listing', subreddit: 'OpenAI', listing: 'top', topTime: 'day' },
        { mode: 'listing', subreddit: 'ClaudeAI', listing: 'top', topTime: 'day' },
        { mode: 'search', query: 'OpenAI OR AI agents', maxItems: 2 },
      ],
    });
    const plan = provider.planScan({ mode: 'search', query: 'OpenAI OR AI agents' }, context);

    const result = await provider.scan(plan, context);

    expect(result.items.map((item) => item.externalId)).toEqual([
      'reddit:t3_openai-live',
      'reddit:t3_search-live',
    ]);
    expect(result.warnings).toContain(
      'Reddit scan pass degraded (ClaudeAI:top:day): fetch failed',
    );
  });

  it('fails configured scan-passes when every Reddit pass is unavailable', async () => {
    const provider = new RedditSourceProvider(
      new CapturingRedditClient({
        listingResponses: new Map<string, RedditListingPage | Error>([
          ['OpenAI:top:day', new Error('fetch failed')],
          ['ClaudeAI:top:day', new Error('upstream timeout')],
        ]),
      }),
      new StaticTokenProvider('reddit-app-only-token'),
    );
    const context = scanContext({
      maxItems: 5,
      scanPasses: [
        { mode: 'listing', subreddit: 'OpenAI', listing: 'top', topTime: 'day' },
        { mode: 'listing', subreddit: 'ClaudeAI', listing: 'top', topTime: 'day' },
      ],
    });
    const plan = provider.planScan({ mode: 'search', query: 'OpenAI OR AI agents' }, context);

    await expect(provider.scan(plan, context)).rejects.toThrow('fetch failed');
  });

  it('skips readable Reddit posts without a valid created timestamp', async () => {
    const client = new CapturingRedditClient({
      posts: [
        {
          id: 'post-missing-created',
          name: 't3_post_missing_created',
          subreddit: 'ClaudeAI',
          title: 'Readable but missing created timestamp',
          selftext: 'This post must not be ingested with an epoch fallback.',
          permalink: '/r/ClaudeAI/comments/post_missing_created/readable_missing_timestamp/',
          score: 420,
        },
        {
          id: 'post-valid-created',
          name: 't3_post_valid_created',
          subreddit: 'ClaudeAI',
          title: 'Readable with created timestamp',
          selftext: 'This post is safe to ingest.',
          permalink: '/r/ClaudeAI/comments/post_valid_created/readable_with_timestamp/',
          createdUtc: 1_782_230_000,
          score: 430,
        },
      ],
    });
    const provider = new RedditSourceProvider(client, new StaticTokenProvider('reddit-app-only-token'));
    const context = scanContext({
      subreddit: 'ClaudeAI',
      listing: 'hot',
      minScore: 100,
    });
    const plan = provider.planScan({ mode: 'listing', query: 'ClaudeAI:hot' }, context);

    const result = await provider.scan(plan, context);

    expect(result.items.map((item) => item.externalId)).toEqual(['reddit:t3_post_valid_created']);
    expect(result.items[0]?.publishedAt).toEqual(new Date(1_782_230_000 * 1000));
    expect(result.warnings).toEqual([
      'Some Reddit posts had no valid created_utc timestamp; they were skipped.',
    ]);
  });

  it('fails closed when a refresh token is present without client credentials', async () => {
    const provider = new RedditSourceProvider(
      new CapturingRedditClient(),
      new StaticTokenProvider('reddit-app-only-token'),
      new StaticRefreshTokenProvider('tenant-refresh-access-token'),
    );
    const context = scanContext({
      refreshToken: 'tenant-refresh-token',
      subreddit: 'observability',
      listing: 'hot',
    });
    const plan = provider.planScan({ mode: 'listing', query: 'observability:hot' }, context);

    await expect(provider.scan(plan, context)).rejects.toThrow('Reddit source config field is required: clientId');
  });

  it('fails closed when neither binding token nor app-only provider is configured', async () => {
    const provider = new RedditSourceProvider(new CapturingRedditClient());
    const context = scanContext({
      subreddit: 'observability',
      listing: 'hot',
    });
    const plan = provider.planScan({ mode: 'listing', query: 'observability:hot' }, context);

    await expect(provider.scan(plan, context)).rejects.toThrow('Reddit app-only OAuth token provider is not configured');
    expect(provider.classifyError(new Error('Reddit app-only OAuth token provider is not configured'))).toEqual({
      kind: 'auth_failed',
      retryable: false,
      message: 'Reddit app-only OAuth token provider is not configured',
    });
  });
});

class StaticTokenProvider implements RedditTokenProviderPort {
  calls = 0;

  constructor(private readonly accessToken: string) {}

  async getAccessToken(): Promise<string> {
    this.calls += 1;
    return this.accessToken;
  }
}

class StaticRefreshTokenProvider implements RedditRefreshTokenProviderPort {
  readonly requests: RedditRefreshTokenRequest[] = [];

  constructor(private readonly accessToken: string) {}

  async getAccessToken(request: RedditRefreshTokenRequest): Promise<string> {
    this.requests.push(request);
    return this.accessToken;
  }
}

class CapturingRedditClient implements RedditClientPort {
  readonly listingRequests: RedditListSubredditPostsRequest[] = [];
  readonly searchRequests: RedditSearchPostsRequest[] = [];

  constructor(
    private readonly response:
      | RedditListingPage
      | {
          readonly listingResponses?: ReadonlyMap<string, RedditListingPage | Error>;
          readonly searchResponse?: RedditListingPage | Error;
        } = { posts: [] },
  ) {}

  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    this.listingRequests.push(request);
    if ('posts' in this.response) {
      return this.response;
    }

    const response = this.response.listingResponses?.get(listingKey(request)) ?? { posts: [] };

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }

  async searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage> {
    this.searchRequests.push(request);
    if ('posts' in this.response) {
      return { posts: [] };
    }

    const response = this.response.searchResponse ?? { posts: [] };

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }
}

const listingKey = (request: RedditListSubredditPostsRequest): string =>
  `${request.subreddit}:${request.listing}:${request.topTime ?? ''}`;

function scanContext(config: SourceRuntimeConfig): SourceProviderScanContext {
  return {
    tenantId: tenantId('tenant-reddit-provider-test'),
    workspaceId: workspaceId('workspace-reddit-provider-test'),
    sourceBindingId: 'source-binding-reddit-provider-test',
    scanJobId: 'scan-job-reddit-provider-test',
    correlationId: 'correlation-reddit-provider-test',
    config,
  };
}

function redditPost(overrides: Partial<RedditListingPage['posts'][number]>) {
  const id = overrides.id ?? 'post-1';

  return {
    id,
    name: `t3_${id}`,
    subreddit: 'OpenAI',
    title: 'Reddit post',
    selftext: 'Useful discussion.',
    permalink: `/r/OpenAI/comments/${id}/reddit_post/`,
    author: 'example-user',
    createdUtc: 1_782_230_000,
    score: 1,
    numComments: 0,
    upvoteRatio: 0.8,
    ...overrides,
  };
}
