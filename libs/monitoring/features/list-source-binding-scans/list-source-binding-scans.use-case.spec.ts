import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

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
import { ListSourceBindingScansUseCase } from './list-source-binding-scans.use-case';

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
  readonly queries: ListScanJobsBySourceBindingQuery[] = [];

  constructor(private readonly result: ListScanJobsBySourceBindingResult) {}

  async listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult> {
    this.queries.push(query);

    return this.result;
  }

  async listBySourceBindingWindow(
    query: ListScanJobsBySourceBindingWindowQuery,
  ): Promise<ListScanJobsBySourceBindingWindowResult> {
    return {
      scanJobs: this.result.scanJobs.filter((job) => {
        const requestedAt = job.toSnapshot().requestedAt.getTime();

        return requestedAt >= query.windowStartedAt.getTime() && requestedAt < query.windowEndedAt.getTime();
      }).slice(0, query.limit),
      truncated: false,
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

const tenant = tenantId('tenant-scan-history');
const workspace = workspaceId('workspace-scan-history');

describe('ListSourceBindingScansUseCase', () => {
  it('lists scan requests with status view and latest attempt counters', async () => {
    const bindings = await readyBindings();
    const attempts = new FakeScanExecutionAttempts();
    attempts.save({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: 'scan-job-2',
      sourceBindingId: 'binding-1',
      status: 'succeeded',
      startedAt: new Date('2026-06-20T10:05:01.000Z'),
      finishedAt: new Date('2026-06-20T10:05:05.000Z'),
      fetched: 12,
      inserted: 8,
      skippedDuplicates: 4,
      projected: 8,
    });
    const history = new FakeScanHistory({
      scanJobs: [
        makeJob('scan-job-2', new Date('2026-06-20T10:05:00.000Z')).markEnqueued({
          enqueuedAt: new Date('2026-06-20T10:05:01.000Z'),
        }).markSucceeded({
          completedAt: new Date('2026-06-20T10:05:05.000Z'),
        }),
        makeJob('scan-job-1', new Date('2026-06-20T10:00:00.000Z')),
      ],
      nextCursor: 'scan-job-0',
    });

    const result = await new ListSourceBindingScansUseCase(
      bindings,
      history,
      attempts,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'binding-1',
      limit: 2,
      cursor: 'cursor-scan-job',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextCursor).toBe('scan-job-0');
      expect(result.value.scanRequests).toEqual([
        expect.objectContaining({
          scanJobId: 'scan-job-2',
          status: 'succeeded',
          userState: 'content_current',
          operatorAction: 'no_action_required',
          latestAttempt: expect.objectContaining({
            fetched: 12,
            inserted: 8,
            skippedDuplicates: 4,
            projected: 8,
          }),
        }),
        expect.objectContaining({
          scanJobId: 'scan-job-1',
          status: 'requested',
          userState: 'scan_pending',
          latestAttempt: undefined,
        }),
      ]);
    }
    expect(history.queries).toEqual([
      {
        tenantId: tenant,
        workspaceId: workspace,
        sourceBindingId: 'binding-1',
        limit: 2,
        cursor: 'cursor-scan-job',
      },
    ]);
  });

  it('returns not found before listing scans for another tenant binding', async () => {
    const result = await new ListSourceBindingScansUseCase(
      new FakeSourceBindings(),
      new FakeScanHistory({ scanJobs: [] }),
      new FakeScanExecutionAttempts(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'missing-binding',
      limit: 20,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects unsafe pagination limits', async () => {
    const result = await new ListSourceBindingScansUseCase(
      await readyBindings(),
      new FakeScanHistory({ scanJobs: [] }),
      new FakeScanExecutionAttempts(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'binding-1',
      limit: 101,
    });

    expect(result.ok).toBe(false);
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
    config: { query: 'scan history' },
    createdAt: new Date('2026-06-20T10:00:00.000Z'),
  }));

  return bindings;
};

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
