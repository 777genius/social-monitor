import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import {
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';
import { InMemoryUserRelevanceProfileRepository } from '@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository';
import { RankFeedItemsUseCase } from '@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case';
import { NoopScanExecutionReporterAdapter } from '@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';
import { XTwitterSourceProvider } from '@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider';
import type {
  SourceConfigReaderPort,
  SourceRuntimeConfig,
} from '@social-monitor/ingestion/ports';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { RelevanceSummaryEvidenceSelector } from '@social-monitor/summary/adapters/evidence/relevance-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-summary-model.adapter';
import { SummaryJob } from '@social-monitor/summary/domain';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { NOOP_USER_SUMMARY_PREFERENCE_READER } from '@social-monitor/summary/ports';

import { InMemoryFeedProjectionAdapter } from '../../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import type {
  XDailyCollectorClientPort,
  XDailyCollectorRequest,
  XDailyCollectorResult,
} from '../../libs/ingestion/adapters/source/x-twitter-experimental-daily/x-daily-collector-client.port';

describe('X/Twitter fake collector summary flow (e2e)', () => {
  it('collects fake X posts, ranks engagement metadata and builds summary citations', async () => {
    const tenant = tenantId('tenant-x-fake-e2e');
    const workspace = workspaceId('workspace-x-fake-e2e');
    const topicId = 'topic-x-fake-e2e';
    const sourceBindingId = 'binding-x-fake-e2e';
    const scanJobId = 'scan-x-fake-e2e';
    const clock = new FixedClock(new Date('2026-06-27T12:00:00.000Z'));
    const ids = new SequenceIdGenerator();
    const collector = new FakeXCollector();
    const feedItems = new InMemoryFeedItemReadRepository();
    const sourceItems = new InMemorySourceItemRepository();

    const provider = new XTwitterSourceProvider(collector, clock);
    const registry = new InMemorySourceProviderRegistry([provider], sourceReadinessProfiles);
    const sourceFetcher = new RegistrySourceFetcherAdapter(
      registry,
      new StaticSourceConfigReader({
        windowHours: 24,
        searchProducts: ['top', 'latest'],
        maxItems: 2,
        limitPerProduct: 3,
        minLikes: 1,
      }),
    );
    const executeScan = new ExecuteScanUseCase(
      sourceFetcher,
      sourceItems,
      new InMemoryFeedProjectionAdapter(feedItems),
      new InMemoryScanAttemptRepository(),
      new InMemoryScanCursorRepository(),
      new NoopScanExecutionReporterAdapter(),
      new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder()),
      new InMemoryScanLeaseAdapter(),
      ids,
      clock,
    );

    const scan = await executeScan.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId,
      topicId,
      sourceBindingId,
      scanPolicyId: 'policy-x-fake-e2e',
      providerKey: 'x-twitter',
      sourceQuery: { mode: 'search', query: 'openai agents' },
      correlationId: 'corr-x-fake-e2e',
      causationId: 'scan-request-x-fake-e2e',
      attemptNumber: 1,
      retryBudget: 3,
    });

    expect(scan).toEqual({
      ok: true,
      value: {
        scanJobId,
        fetched: 2,
        inserted: 2,
        skippedDuplicates: 0,
        projected: 2,
      },
    });
    expect(collector.requests).toEqual([
      expect.objectContaining({
        query: 'openai agents',
        searchProducts: ['top', 'latest'],
        windowHours: 24,
        minLikes: 1,
      }),
    ]);
    expect(sourceItems.all()).toHaveLength(2);
    expect(sourceItems.all()[0]?.toSnapshot().metadata).toEqual(expect.objectContaining({
      kind: 'x_post',
      provider: 'x-twitter',
      searchQuery: 'openai agents',
      publicMetrics: expect.objectContaining({
        like_count: 120,
        retweet_count: 30,
        reply_count: 8,
      }),
    }));

    const rankFeedItems = new RankFeedItemsUseCase(
      feedItems,
      new InMemoryUserRelevanceProfileRepository(),
      clock,
    );
    const ranked = await rankFeedItems.execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
      limit: 10,
    });

    expect(ranked.ok).toBe(true);
    expect(ranked.ok && ranked.value.items[0]).toEqual(expect.objectContaining({
      providerKey: 'x-twitter',
      providerMetadata: expect.objectContaining({
        kind: 'x_post',
        publicMetrics: expect.objectContaining({
          like_count: 120,
        }),
      }),
    }));

    const summaryJobs = new InMemorySummaryJobRepository();
    const summaryArtifacts = new InMemorySummaryArtifactRepository();
    await summaryJobs.save(SummaryJob.request({
      id: 'summary-job-x-fake-e2e',
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
      idempotencyKey: 'summary-x-fake-e2e',
      requestedAt: clock.now(),
    }));

    const executeSummary = new ExecuteSummaryJobUseCase(
      summaryJobs,
      summaryArtifacts,
      new InMemorySummaryPolicyRepository(),
      NOOP_USER_SUMMARY_PREFERENCE_READER,
      new RelevanceSummaryEvidenceSelector(rankFeedItems, clock),
      new DeterministicSummaryModelAdapter(),
      new InMemorySummaryEventPublisher(),
      ids,
      clock,
    );
    const summary = await executeSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-x-fake-e2e',
      maxEvidenceItems: 10,
    });

    expect(summary.ok).toBe(true);
    const artifact = summary.ok && summary.value.summaryId
      ? await summaryArtifacts.findById({
          tenantId: tenant,
          workspaceId: workspace,
          summaryId: summary.value.summaryId,
        })
      : null;
    const snapshot = artifact?.toSnapshot();

    expect(snapshot).toEqual(expect.objectContaining({
      topicId,
      qualityFlags: ['limited_sources'],
      citationMap: expect.arrayContaining([
        expect.objectContaining({
          providerKey: 'x-twitter',
          canonicalUrl: 'https://x.com/highsignal/status/100',
        }),
      ]),
      sourceHighlights: expect.arrayContaining([
        expect.stringContaining('X post by @highsignal'),
      ]),
    }));
    expect(snapshot?.sourceWindow.selectedFeedItemIds).toHaveLength(2);
  });
});

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;

    return id;
  }
}

class StaticSourceConfigReader implements SourceConfigReaderPort {
  constructor(private readonly config: SourceRuntimeConfig) {}

  async readConfig(): Promise<SourceRuntimeConfig> {
    return this.config;
  }
}

class FakeXCollector implements XDailyCollectorClientPort {
  readonly requests: XDailyCollectorRequest[] = [];

  async collectDailySearch(request: XDailyCollectorRequest): Promise<XDailyCollectorResult> {
    this.requests.push(request);

    return {
      nextCursor: 'x-fake-cursor',
      warnings: [],
      posts: [
        {
          tweetId: '100',
          canonicalUrl: 'https://x.com/highsignal/status/100',
          text: 'OpenAI agents shipped a new orchestration pattern that teams are discussing today.',
          authorHandle: 'highsignal',
          authorName: 'High Signal',
          publishedAt: new Date('2026-06-27T10:30:00.000Z'),
          metrics: {
            likes: 120,
            retweets: 30,
            replies: 8,
            quotes: 4,
            views: 12_000,
          },
          mediaUrls: [],
          sourceProduct: 'top',
          trendScore: 88,
        },
        {
          tweetId: '200',
          canonicalUrl: 'https://x.com/freshsignal/status/200',
          text: 'A fresh OpenAI agents example is starting to trend among builders.',
          authorHandle: 'freshsignal',
          authorName: 'Fresh Signal',
          publishedAt: new Date('2026-06-27T11:15:00.000Z'),
          metrics: {
            likes: 22,
            retweets: 5,
            replies: 2,
          },
          mediaUrls: [],
          sourceProduct: 'latest',
          trendScore: 31,
        },
      ],
      run: {
        collectorEngine: 'fake-x-collector',
        collectorVersion: 'test',
        requestedLimit: request.maxItems,
        fetchedCount: 2,
        returnedCount: 2,
        partial: false,
      },
    };
  }
}
