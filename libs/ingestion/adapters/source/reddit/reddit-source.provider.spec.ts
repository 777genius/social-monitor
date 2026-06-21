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

  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    this.listingRequests.push(request);
    return { posts: [] };
  }

  async searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage> {
    this.searchRequests.push(request);
    return { posts: [] };
  }
}

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
