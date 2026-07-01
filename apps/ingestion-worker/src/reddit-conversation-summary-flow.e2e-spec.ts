import { InMemoryConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository';
import { ConversationUnitProjectionAdapter } from '@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { NoopScanExecutionReporterAdapter } from '@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { RedditSourceProvider } from '@social-monitor/ingestion/adapters/source/reddit/reddit-source.provider';
import { StaticRedditTokenProvider } from '@social-monitor/ingestion/adapters/source/reddit/static-reddit-token-provider';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  RedditClientPort,
  RedditCommentPage,
  RedditListingPage,
  RedditListPostCommentsRequest,
  RedditListSubredditPostsRequest,
  RedditSearchPostsRequest,
} from '@social-monitor/ingestion/adapters/source/reddit/reddit-client.port';
import type { SourceConfigReaderPort } from '@social-monitor/ingestion/ports';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import {
  FixedClock,
  tenantId,
  workspaceId,
  type IdGenerator,
} from '@social-monitor/shared-kernel';
import { ConversationSummaryEvidenceSelector } from '@social-monitor/summary/adapters/evidence/conversation-summary-evidence.selector';
import { FeedSummaryEvidenceSelector } from '@social-monitor/summary/adapters/evidence/feed-summary-evidence.selector';

import { InMemoryFeedProjectionAdapter } from './adapters/feed/in-memory-feed-projection.adapter';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `e2e-id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class StaticSourceConfigReader implements SourceConfigReaderPort {
  async readConfig() {
    return {
      subreddit: 'ClaudeAI',
      listing: 'hot',
      maxItems: 5,
      includeComments: true,
      maxCommentsPerPost: 3,
      commentDepth: 2,
      commentSort: 'confidence',
      minScore: 0,
    };
  }
}

class CapturingRedditClient implements RedditClientPort {
  readonly listingRequests: RedditListSubredditPostsRequest[] = [];
  readonly commentRequests: RedditListPostCommentsRequest[] = [];

  async listSubredditPosts(
    request: RedditListSubredditPostsRequest,
  ): Promise<RedditListingPage> {
    this.listingRequests.push(request);

    return {
      posts: [
        {
          id: 'post_1',
          name: 't3_post_1',
          subreddit: 'ClaudeAI',
          title: 'Claude Code workflow monitoring',
          selftext: 'Users compare provider signals and summary quality.',
          author: 'workflow-builder',
          permalink: '/r/ClaudeAI/comments/post_1/workflow_monitoring/',
          createdUtc: 1_782_230_000,
          score: 120,
          numComments: 2,
          upvoteRatio: 0.92,
        },
      ],
      after: 't3_after',
    };
  }

  async searchPosts(
    request: RedditSearchPostsRequest,
  ): Promise<RedditListingPage> {
    void request;

    return { posts: [] };
  }

  async listPostComments(
    request: RedditListPostCommentsRequest,
  ): Promise<RedditCommentPage> {
    this.commentRequests.push(request);

    return {
      comments: [
        {
          id: 'comment_low',
          name: 't1_comment_low',
          subreddit: 'ClaudeAI',
          body: 'Parent comment sets up the reliability concern.',
          author: 'quiet-user',
          permalink: '/r/ClaudeAI/comments/post_1/_/comment_low/',
          parentId: 't3_post_1',
          createdUtc: 1_782_230_030,
          score: 2,
          replyCount: 0,
          depth: 0,
        },
        {
          id: 'comment_high',
          name: 't1_comment_high',
          subreddit: 'ClaudeAI',
          body: 'The useful signal is in high-score replies, not only the post title.',
          author: 'summary-builder',
          permalink: '/r/ClaudeAI/comments/post_1/_/comment_high/',
          parentId: 't1_comment_low',
          createdUtc: 1_782_230_060,
          score: 75,
          replyCount: 3,
          depth: 1,
        },
      ],
    };
  }
}

describe('Reddit conversation summary flow', () => {
  it('keeps Reddit comments out of FeedItem and adds ranked comments to summary evidence', async () => {
    const ids = new SequenceIdGenerator();
    const clock = new FixedClock(new Date('2026-06-05T12:00:00.000Z'));
    const redditClient = new CapturingRedditClient();
    const feedItems = new InMemoryFeedItemReadRepository();
    const conversationUnits = new InMemoryConversationUnitRepository();
    const sourceFetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry(
        [
          new RedditSourceProvider(
            redditClient,
            new StaticRedditTokenProvider('reddit-token'),
          ),
        ],
        [],
      ),
      new StaticSourceConfigReader(),
    );
    const scan = new ExecuteScanUseCase(
      sourceFetcher,
      new InMemorySourceItemRepository(),
      new InMemoryFeedProjectionAdapter(feedItems),
      new InMemoryScanAttemptRepository(),
      new InMemoryScanCursorRepository(),
      new NoopScanExecutionReporterAdapter(),
      new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder()),
      new InMemoryScanLeaseAdapter(),
      ids,
      clock,
      undefined,
      undefined,
      new ConversationUnitProjectionAdapter(conversationUnits, ids),
    );

    const scanResult = await scan.execute({
      tenantId: tenantId('tenant-reddit-conversation-e2e'),
      workspaceId: workspaceId('workspace-reddit-conversation-e2e'),
      scanJobId: 'scan-job-1',
      interestId: 'interest-ai-devtools',
      sourceBindingId: 'source-binding-reddit',
      scanPolicyId: 'scan-policy-1',
      providerKey: 'reddit',
      sourceQuery: { mode: 'listing', query: 'ClaudeAI:hot' },
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });

    expect(scanResult).toMatchObject({
      ok: true,
      value: {
        fetched: 1,
        inserted: 1,
        projected: 1,
      },
    });
    expect(redditClient.commentRequests).toEqual([
      expect.objectContaining({
        postId: 'post_1',
        subreddit: 'ClaudeAI',
        limit: 3,
        depth: 2,
        sort: 'confidence',
      }),
    ]);
    expect(feedItems.all()).toHaveLength(1);
    expect(conversationUnits.all()).toHaveLength(2);

    const summarySelector = new ConversationSummaryEvidenceSelector(
      new FeedSummaryEvidenceSelector(feedItems, clock),
      conversationUnits,
      conversationUnits,
      clock,
      { promptLimitPerRoot: 1 },
    );
    const summaryEvidence = await summarySelector.select({
      tenantId: tenantId('tenant-reddit-conversation-e2e'),
      workspaceId: workspaceId('workspace-reddit-conversation-e2e'),
      interestId: 'interest-ai-devtools',
      maxItems: 5,
    });

    expect(summaryEvidence.items).toHaveLength(1);
    expect(summaryEvidence.items[0]).toMatchObject({
      providerKey: 'reddit',
      title: 'Claude Code workflow monitoring',
      conversationContext: {
        rankingBasis: 'cohort_baseline_v1',
        units: [
          {
            providerUnitId: 't1_comment_high',
            parentProviderUnitId: 't1_comment_low',
            providerScore: 75,
            replyCount: 3,
            depth: 1,
            role: 'reply',
            selectionReason: 'ranked',
            body: 'The useful signal is in high-score replies, not only the post title.',
            ancestry: [
              {
                providerUnitId: 't1_comment_low',
                selectionReason: 'ancestor_context',
                providerScore: 2,
                depth: 0,
                role: 'top_level_comment',
                body: 'Parent comment sets up the reliability concern.',
              },
            ],
          },
        ],
      },
    });
  });
});
