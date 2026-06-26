import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, SourceBinding } from '../../domain';
import type {
  FindScanExecutionAttemptQuery,
  ListScanJobsBySourceBindingQuery,
  ListScanJobsBySourceBindingResult,
  ListScanJobsBySourceBindingWindowQuery,
  ListScanJobsBySourceBindingWindowResult,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanJobHistoryReadPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { ListSourceBindingDailyHistoryUseCase } from './list-source-binding-daily-history.use-case';

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindings.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
  }

  async findByTopicAndProvider(): Promise<SourceBinding | null> {
    return null;
  }

  async findById(params: Parameters<SourceBindingRepositoryPort['findById']>[0]): Promise<SourceBinding | null> {
    return this.bindings.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }

  async listByTopic(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindings.values()].filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.topicId === query.topicId
        );
      }),
    };
  }
}

class FakeScanHistory implements ScanJobHistoryReadPort {
  readonly windowQueries: ListScanJobsBySourceBindingWindowQuery[] = [];

  constructor(
    private readonly jobs: readonly ScanJob[],
    private readonly truncated: boolean = false,
  ) {}

  async listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult> {
    return {
      scanJobs: this.jobs.slice(0, query.limit),
    };
  }

  async listBySourceBindingWindow(
    query: ListScanJobsBySourceBindingWindowQuery,
  ): Promise<ListScanJobsBySourceBindingWindowResult> {
    this.windowQueries.push(query);

    return {
      scanJobs: this.jobs.filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.sourceBindingId === query.sourceBindingId &&
          snapshot.requestedAt.getTime() >= query.windowStartedAt.getTime() &&
          snapshot.requestedAt.getTime() < query.windowEndedAt.getTime()
        );
      }).slice(0, query.limit),
      truncated: this.truncated,
    };
  }
}

class FakeScanExecutionAttempts implements ScanExecutionAttemptReadPort {
  private readonly attempts = new Map<string, ScanExecutionAttemptSnapshot>();

  save(attempt: ScanExecutionAttemptSnapshot): void {
    this.attempts.set(`${attempt.tenantId}:${attempt.workspaceId}:${attempt.scanJobId}`, attempt);
  }

  async findLatestByScanJob(query: FindScanExecutionAttemptQuery): Promise<ScanExecutionAttemptSnapshot | null> {
    return this.attempts.get(`${query.tenantId}:${query.workspaceId}:${query.scanJobId}`) ?? null;
  }
}

const tenant = tenantId('tenant-daily-history');
const workspace = workspaceId('workspace-daily-history');
const now = new Date('2026-06-25T18:30:00.000Z');

describe('ListSourceBindingDailyHistoryUseCase', () => {
  it('returns empty UTC day buckets when the source has no scans', async () => {
    const bindings = await readyBindings();
    const scanHistory = new FakeScanHistory([]);

    const result = await new ListSourceBindingDailyHistoryUseCase(
      bindings,
      scanHistory,
      new FakeScanExecutionAttempts(),
      new FixedClock(now),
    ).execute(baseQuery({ days: 3 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        sourceBindingId: 'binding-1',
        topicId: 'topic-1',
        providerKey: 'fake-source',
        sourceBindingStatus: 'enabled',
        windowStartedAt: '2026-06-23T00:00:00.000Z',
        windowEndedAt: '2026-06-26T00:00:00.000Z',
        summary: {
          providerHealthState: 'unknown',
          totalScans: 0,
          succeededScans: 0,
          failedScans: 0,
          activeScans: 0,
          rateLimitedScans: 0,
          providerUnavailableScans: 0,
          consecutiveFailures: 0,
          fetched: 0,
          inserted: 0,
          skippedDuplicates: 0,
          projected: 0,
          daysWithScans: 0,
          daysWithFailures: 0,
          daysWithRateLimits: 0,
          operatorAction: 'wait_for_next_scan_or_trigger_manual_scan',
          signals: ['no_recent_scans'],
        },
        truncated: false,
        maxScanJobs: 300,
        days: [
          expect.objectContaining({
            date: '2026-06-23',
            providerHealthState: 'unknown',
            totalScans: 0,
            signals: ['no_recent_scans'],
          }),
          expect.objectContaining({
            date: '2026-06-24',
            providerHealthState: 'unknown',
            totalScans: 0,
            signals: ['no_recent_scans'],
          }),
          expect.objectContaining({
            date: '2026-06-25',
            providerHealthState: 'unknown',
            totalScans: 0,
            signals: ['no_recent_scans'],
          }),
        ],
      });
    }
    expect(scanHistory.windowQueries[0]).toEqual(expect.objectContaining({
      windowStartedAt: new Date('2026-06-23T00:00:00.000Z'),
      windowEndedAt: new Date('2026-06-26T00:00:00.000Z'),
      limit: 300,
    }));
  });

  it('aggregates daily provider health and attempt counters', async () => {
    const attempts = new FakeScanExecutionAttempts();
    attempts.save(attempt({
      scanJobId: 'scan-success',
      fetched: 12,
      inserted: 7,
      skippedDuplicates: 3,
      projected: 7,
    }));
    attempts.save(attempt({
      scanJobId: 'scan-rate-limit',
      status: 'failed',
      fetched: 0,
      inserted: 0,
      skippedDuplicates: 0,
      projected: 0,
      failureReason: 'Provider rate limit 429',
    }));
    const jobs = [
      makeJob('scan-active', new Date('2026-06-25T17:00:00.000Z'))
        .markEnqueued({ enqueuedAt: new Date('2026-06-25T17:00:01.000Z') }),
      makeJob('scan-rate-limit', new Date('2026-06-25T16:00:00.000Z'))
        .markEnqueued({ enqueuedAt: new Date('2026-06-25T16:00:01.000Z') })
        .markFailed({
          completedAt: new Date('2026-06-25T16:00:05.000Z'),
          failureReason: 'Provider rate limit 429',
        }),
      makeJob('scan-success', new Date('2026-06-24T10:00:00.000Z'))
        .markEnqueued({ enqueuedAt: new Date('2026-06-24T10:00:01.000Z') })
        .markSucceeded({ completedAt: new Date('2026-06-24T10:00:05.000Z') }),
    ];

    const result = await new ListSourceBindingDailyHistoryUseCase(
      await readyBindings(),
      new FakeScanHistory(jobs),
      attempts,
      new FixedClock(now),
    ).execute(baseQuery({ days: 2 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toEqual({
        providerHealthState: 'degraded',
        totalScans: 3,
        succeededScans: 1,
        failedScans: 1,
        activeScans: 1,
        rateLimitedScans: 1,
        providerUnavailableScans: 0,
        consecutiveFailures: 1,
        fetched: 12,
        inserted: 7,
        skippedDuplicates: 3,
        projected: 7,
        daysWithScans: 2,
        daysWithFailures: 1,
        daysWithRateLimits: 1,
        lastScanRequestedAt: '2026-06-25T17:00:00.000Z',
        lastCompletedAt: '2026-06-25T16:00:05.000Z',
        operatorAction: 'inspect_recent_scan_failures_and_rate_limits',
        signals: ['recent_success', 'recent_failure', 'active_scan_in_progress', 'rate_limited'],
      });
      expect(result.value.days).toEqual([
        expect.objectContaining({
          date: '2026-06-24',
          providerHealthState: 'operational',
          totalScans: 1,
          succeededScans: 1,
          failedScans: 0,
          activeScans: 0,
          fetched: 12,
          inserted: 7,
          skippedDuplicates: 3,
          projected: 7,
          lastScanRequestedAt: '2026-06-24T10:00:00.000Z',
          lastCompletedAt: '2026-06-24T10:00:05.000Z',
          signals: ['recent_success'],
        }),
        expect.objectContaining({
          date: '2026-06-25',
          providerHealthState: 'degraded',
          totalScans: 2,
          succeededScans: 0,
          failedScans: 1,
          activeScans: 1,
          rateLimitedScans: 1,
          operatorAction: 'inspect_recent_scan_failures_and_rate_limits',
          signals: ['recent_failure', 'active_scan_in_progress', 'rate_limited'],
        }),
      ]);
    }
  });

  it('propagates truncation when the source has more scans than the history cap', async () => {
    const result = await new ListSourceBindingDailyHistoryUseCase(
      await readyBindings(),
      new FakeScanHistory([], true),
      new FakeScanExecutionAttempts(),
      new FixedClock(now),
    ).execute(baseQuery({ days: 1 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.truncated).toBe(true);
      expect(result.value.maxScanJobs).toBe(100);
    }
  });

  it('rejects missing bindings and unsafe day ranges', async () => {
    const missing = await new ListSourceBindingDailyHistoryUseCase(
      new FakeSourceBindings(),
      new FakeScanHistory([]),
      new FakeScanExecutionAttempts(),
      new FixedClock(now),
    ).execute(baseQuery({ days: 7 }));
    const invalidDays = await new ListSourceBindingDailyHistoryUseCase(
      await readyBindings(),
      new FakeScanHistory([]),
      new FakeScanExecutionAttempts(),
      new FixedClock(now),
    ).execute(baseQuery({ days: 91 }));

    expect(missing.ok).toBe(false);
    expect(invalidDays.ok).toBe(false);
  });
});

const readyBindings = async (): Promise<FakeSourceBindings> => {
  const bindings = new FakeSourceBindings();
  await bindings.save(SourceBinding.create({
    id: 'binding-1',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: { query: 'daily history' },
    createdAt: new Date('2026-06-20T10:00:00.000Z'),
  }));

  return bindings;
};

const baseQuery = (params: { readonly days: number }) => ({
  tenantId: tenant,
  workspaceId: workspace,
  sourceBindingId: 'binding-1',
  days: params.days,
});

const makeJob = (id: string, requestedAt: Date) =>
  ScanJob.request({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'binding-1',
    scanPolicyId: 'policy-1',
    idempotencyKey: `idempotency-${id}`,
    requestedAt,
  });

const attempt = (params: {
  readonly scanJobId: string;
  readonly status?: 'succeeded' | 'failed';
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly failureReason?: string;
}): ScanExecutionAttemptSnapshot => ({
  tenantId: tenant,
  workspaceId: workspace,
  scanJobId: params.scanJobId,
  sourceBindingId: 'binding-1',
  status: params.status ?? 'succeeded',
  startedAt: new Date('2026-06-25T16:00:01.000Z'),
  finishedAt: new Date('2026-06-25T16:00:05.000Z'),
  fetched: params.fetched,
  inserted: params.inserted,
  skippedDuplicates: params.skippedDuplicates,
  projected: params.projected,
  failureReason: params.failureReason,
});
