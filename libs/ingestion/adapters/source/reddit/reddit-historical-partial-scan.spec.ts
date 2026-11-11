import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type {
  RedditClientPort,
  RedditListingPage,
  RedditListSubredditPostsRequest,
} from './reddit-client.port';
import { RedditSourceProvider } from './reddit-source.provider';

describe('Reddit historical scan partial lanes', () => {
  it('keeps current-day results when another lane fails', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T12:00:00Z'));
    try {
      const client: RedditClientPort = {
        async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
          if (request.subreddit === 'ClaudeAI') throw new Error('current lane failed');
          return { posts: [{ id: 'abc123', title: 'Current post', subreddit: 'OpenAI',
            createdUtc: Date.parse('2026-07-07T10:00:00Z') / 1000 }] };
        },
        async searchPosts() { return { posts: [] }; },
        async listPostComments() { return { comments: [] }; },
      };
      const provider = new RedditSourceProvider(client, { async getAccessToken() { return 'test-token'; } });
      const context = {
        tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
        sourceBindingId: 'binding-test', scanJobId: 'scan-test', correlationId: 'correlation-test',
        config: {
          targetPublishedWindow: { startInclusive: '2026-07-07T00:00:00Z', endExclusive: '2026-07-08T00:00:00Z', observedAt: '2026-07-07T12:00:00Z' },
          scanPasses: [
            { mode: 'listing', subreddit: 'OpenAI', listing: 'new' },
            { mode: 'listing', subreddit: 'ClaudeAI', listing: 'new' },
          ],
        },
      };
      const result = await provider.scan(provider.planScan({ mode: 'search', query: 'AI agents' }, context), context);
      expect(result.items).toHaveLength(1);
      expect(result.collection).toEqual({ complete: false, backfillPending: true });
    } finally { jest.useRealTimers(); }
  });

  it('treats the day as closed at its exclusive end', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T00:00:00Z'));
    try {
      const client: RedditClientPort = {
        async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
          if (request.subreddit === 'ClaudeAI') throw new Error('closed lane failed');
          return { posts: [] };
        },
        async searchPosts() { return { posts: [] }; },
        async listPostComments() { return { comments: [] }; },
      };
      const provider = new RedditSourceProvider(client, { async getAccessToken() { return 'test-token'; } });
      const context = {
        tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
        sourceBindingId: 'binding-test', scanJobId: 'scan-test', correlationId: 'correlation-test',
        config: {
          targetPublishedWindow: { startInclusive: '2026-07-07T00:00:00Z', endExclusive: '2026-07-08T00:00:00Z', observedAt: '2026-07-08T00:00:00Z' },
          scanPasses: [ { mode: 'listing', subreddit: 'OpenAI', listing: 'new' },
            { mode: 'listing', subreddit: 'ClaudeAI', listing: 'new' } ],
        },
      };
      await expect(provider.scan(provider.planScan({ mode: 'search', query: 'AI agents' }, context), context))
        .rejects.toThrow('closed lane failed');
    } finally { jest.useRealTimers(); }
  });

  it('retries the window when one lane fails after another succeeds', async () => {
    const client: RedditClientPort = {
      async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
        if (request.subreddit === 'ClaudeAI') throw new Error('historical lane failed');
        return { posts: [] };
      },
      async searchPosts() { return { posts: [] }; },
      async listPostComments() { return { comments: [] }; },
    };
    const provider = new RedditSourceProvider(client, {
      async getAccessToken() { return 'test-token'; },
    });
    const context = {
      tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
      sourceBindingId: 'binding-test', scanJobId: 'scan-test', correlationId: 'correlation-test',
      config: {
        targetPublishedWindow: {
          startInclusive: '2026-07-07T00:00:00.000Z',
          endExclusive: '2026-07-08T00:00:00.000Z',
        },
        scanPasses: [
          { mode: 'listing', subreddit: 'OpenAI', listing: 'new' },
          { mode: 'listing', subreddit: 'ClaudeAI', listing: 'new' },
        ],
      },
    };
    const plan = provider.planScan({ mode: 'search', query: 'AI agents' }, context);
    await expect(provider.scan(plan, context)).rejects.toThrow('historical lane failed');
  });
});
