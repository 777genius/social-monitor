import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type {
  RedditClientPort,
  RedditListingPage,
  RedditListSubredditPostsRequest,
} from './reddit-client.port';
import { RedditSourceProvider } from './reddit-source.provider';

describe('Reddit historical scan partial lanes', () => {
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
