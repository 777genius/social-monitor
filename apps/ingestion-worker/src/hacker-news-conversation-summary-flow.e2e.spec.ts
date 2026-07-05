import { ConversationUnitProjectionAdapter } from '@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter';
import { InMemoryConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { NoopScanExecutionReporterAdapter } from '@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import type {
  HackerNewsClientPort,
  HackerNewsListStoryCommentsRequest,
  HackerNewsStory,
} from '@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port';
import { HackerNewsSourceProvider } from '@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
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
    const id = `hn-e2e-id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class StaticHackerNewsSourceConfigReader implements SourceConfigReaderPort {
  async readConfig() {
    return {
      maxItems: 5,
      scanPasses: [
        {
          mode: 'search',
          target: 'comment',
          query: 'agent monitoring',
          maxItems: 3,
        },
      ],
    };
  }
}

class StaticHackerNewsListingCommentsConfigReader
  implements SourceConfigReaderPort
{
  async readConfig() {
    return {
      maxItems: 5,
      includeComments: true,
      maxCommentsPerPost: 2,
      commentDepth: 1,
    };
  }
}

class CapturingHackerNewsClient implements HackerNewsClientPort {
  readonly commentSearches: { readonly query: string; readonly limit: number }[] = [];
  readonly storyLookups: number[] = [];
  readonly storyCommentRequests: HackerNewsListStoryCommentsRequest[] = [];

  async searchStories(): Promise<readonly HackerNewsStory[]> {
    return [];
  }

  async searchComments(
    query: string,
    limit: number,
  ): Promise<readonly HackerNewsStory[]> {
    this.commentSearches.push({ query, limit });

    const comments: readonly HackerNewsStory[] = [
      {
        kind: 'comment',
        id: 2001,
        storyId: 1001,
        parentId: 1001,
        storyTitle: 'Ask HN: Agent monitoring in production',
        by: 'root-commenter',
        time: 1_782_230_030,
        text: 'The parent HN comment frames the operational risk.',
        score: 3,
      },
      {
        kind: 'comment',
        id: 2002,
        storyId: 1001,
        parentId: 2001,
        storyTitle: 'Ask HN: Agent monitoring in production',
        by: 'signal-builder',
        time: 1_782_230_060,
        text: 'The useful HN signal is a high-score reply about bounded agent telemetry.',
        score: 80,
      },
    ];

    return comments.slice(0, limit);
  }

  async getStory(id: number): Promise<HackerNewsStory | null> {
    this.storyLookups.push(id);

    if (id !== 1001) {
      return null;
    }

    return {
      id,
      title: 'Ask HN: Agent monitoring in production',
      text: 'Operators compare ways to monitor AI agents.',
      by: 'ops-builder',
      time: 1_782_230_000,
      score: 120,
      comments: 2,
    };
  }

  async listStoryComments(
    request: HackerNewsListStoryCommentsRequest,
  ): Promise<readonly HackerNewsStory[]> {
    this.storyCommentRequests.push(request);

    if (request.storyId !== 1001) {
      return [];
    }

    const comments: readonly HackerNewsStory[] = [
      {
        kind: 'comment',
        id: 2001,
        storyId: 1001,
        parentId: 1001,
        storyTitle: 'Ask HN: Agent monitoring in production',
        by: 'root-commenter',
        time: 1_782_230_030,
        text: 'The parent HN comment frames the operational risk.',
        kids: [2002],
        depth: 0,
        rank: 1,
      },
      {
        kind: 'comment',
        id: 2002,
        storyId: 1001,
        parentId: 2001,
        storyTitle: 'Ask HN: Agent monitoring in production',
        by: 'signal-builder',
        time: 1_782_230_060,
        text: 'The useful HN signal is a high-score reply about bounded agent telemetry.',
        depth: 1,
        rank: 2,
      },
    ];

    return comments
      .filter((comment) => (comment.depth ?? 0) <= request.depth)
      .slice(0, request.limit);
  }

  async listStories(): Promise<readonly HackerNewsStory[]> {
    return [
      {
        id: 1001,
        title: 'Ask HN: Agent monitoring in production',
        text: 'Operators compare ways to monitor AI agents.',
        by: 'ops-builder',
        time: 1_782_230_000,
        score: 120,
        comments: 2,
      },
    ];
  }
}

describe('Hacker News conversation summary e2e flow', () => {
  it('projects HN comment search hits as conversation units for the root story', async () => {
    const ids = new SequenceIdGenerator();
    const clock = new FixedClock(new Date('2026-06-05T12:00:00.000Z'));
    const hackerNewsClient = new CapturingHackerNewsClient();
    const feedItems = new InMemoryFeedItemReadRepository();
    const conversationUnits = new InMemoryConversationUnitRepository();
    const sourceFetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry(
        [new HackerNewsSourceProvider(hackerNewsClient, clock)],
        [],
      ),
      new StaticHackerNewsSourceConfigReader(),
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
      tenantId: tenantId('tenant-hn-conversation-e2e'),
      workspaceId: workspaceId('workspace-hn-conversation-e2e'),
      scanJobId: 'scan-job-hn-1',
      interestId: 'interest-ai-devtools',
      sourceBindingId: 'source-binding-hn',
      scanPolicyId: 'scan-policy-hn-1',
      providerKey: 'hacker-news',
      sourceQuery: { mode: 'search', query: 'agent monitoring' },
      correlationId: 'correlation-hn-1',
      causationId: 'causation-hn-1',
    });

    expect(scanResult).toMatchObject({
      ok: true,
      value: {
        fetched: 1,
        inserted: 1,
        projected: 1,
      },
    });
    expect(hackerNewsClient.commentSearches).toEqual([
      { query: 'agent monitoring', limit: 3 },
    ]);
    expect(hackerNewsClient.storyLookups).toEqual([1001]);
    expect(hackerNewsClient.storyCommentRequests).toEqual([]);
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
      tenantId: tenantId('tenant-hn-conversation-e2e'),
      workspaceId: workspaceId('workspace-hn-conversation-e2e'),
      interestId: 'interest-ai-devtools',
      maxItems: 5,
    });

    expect(summaryEvidence.items).toHaveLength(1);
    expect(summaryEvidence.items[0]).toMatchObject({
      providerKey: 'hacker-news',
      title: 'Ask HN: Agent monitoring in production',
      conversationContext: {
        rankingBasis: 'cohort_baseline_v1',
        units: [
          {
            providerUnitId: 'hn:2002',
            parentProviderUnitId: 'hn:2001',
            providerScore: 80,
            replyCount: 0,
            depth: 1,
            role: 'reply',
            selectionReason: 'ranked',
            body: 'The useful HN signal is a high-score reply about bounded agent telemetry.',
            ancestry: [
              {
                providerUnitId: 'hn:2001',
                selectionReason: 'ancestor_context',
                providerScore: 3,
                depth: 0,
                role: 'top_level_comment',
                body: 'The parent HN comment frames the operational risk.',
              },
            ],
          },
        ],
      },
    });
  });

  it('fetches bounded HN story comments as conversation units', async () => {
    const ids = new SequenceIdGenerator();
    const clock = new FixedClock(new Date('2026-06-05T12:00:00.000Z'));
    const hackerNewsClient = new CapturingHackerNewsClient();
    const feedItems = new InMemoryFeedItemReadRepository();
    const conversationUnits = new InMemoryConversationUnitRepository();
    const sourceFetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry(
        [new HackerNewsSourceProvider(hackerNewsClient, clock)],
        [],
      ),
      new StaticHackerNewsListingCommentsConfigReader(),
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
      tenantId: tenantId('tenant-hn-listing-comments-e2e'),
      workspaceId: workspaceId('workspace-hn-listing-comments-e2e'),
      scanJobId: 'scan-job-hn-2',
      interestId: 'interest-ai-devtools',
      sourceBindingId: 'source-binding-hn',
      scanPolicyId: 'scan-policy-hn-2',
      providerKey: 'hacker-news',
      sourceQuery: { mode: 'listing', query: 'top' },
      correlationId: 'correlation-hn-2',
      causationId: 'causation-hn-2',
    });

    expect(scanResult).toMatchObject({
      ok: true,
      value: {
        fetched: 1,
        inserted: 1,
        projected: 1,
      },
    });
    expect(hackerNewsClient.storyCommentRequests).toEqual([
      { storyId: 1001, limit: 2, depth: 1 },
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
      tenantId: tenantId('tenant-hn-listing-comments-e2e'),
      workspaceId: workspaceId('workspace-hn-listing-comments-e2e'),
      interestId: 'interest-ai-devtools',
      maxItems: 5,
    });

    expect(summaryEvidence.items[0]?.conversationContext).toMatchObject({
      rankingBasis: 'cohort_baseline_v1',
      units: [
        {
          providerUnitId: 'hn:2001',
          replyCount: 1,
          depth: 0,
          role: 'top_level_comment',
          selectionReason: 'ranked',
        },
      ],
    });
  });
});
