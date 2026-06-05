import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ScanAttempt, SourceItem } from '../../domain';
import type {
  FetchSourceItemsCommand,
  FetchedSourceItem,
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
  ScanAttemptRepositoryPort,
  ScanFailureQueuePort,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
  SourceFetcherPort,
  SourceItemRepositoryPort,
} from '../../ports';
import { ExecuteScanUseCase } from './execute-scan.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `source-item-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FixedSourceFetcher implements SourceFetcherPort {
  readonly calls: FetchSourceItemsCommand[] = [];

  async fetch(command: FetchSourceItemsCommand): Promise<readonly FetchedSourceItem[]> {
    this.calls.push(command);

    return [
      {
        externalId: 'external-1',
        canonicalUrl: 'https://example.test/external-1',
        title: 'External 1',
        body: 'Body 1',
        authorHandle: 'author',
        publishedAt: new Date('2026-06-05T00:00:00.000Z'),
      },
      {
        externalId: 'external-2',
        canonicalUrl: 'https://example.test/external-2',
        title: 'External 2',
        body: 'Body 2',
        authorHandle: 'author',
        publishedAt: new Date('2026-06-05T00:01:00.000Z'),
      },
    ];
  }
}

class FailingSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<readonly FetchedSourceItem[]> {
    throw new Error('Provider unavailable');
  }
}

class FakeSourceItemRepository implements SourceItemRepositoryPort {
  private readonly itemsByKey = new Map<string, SourceItem>();

  async saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let skippedDuplicates = 0;

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const key = `${command.tenantId}:${command.workspaceId}:${snapshot.sourceBindingId}:${snapshot.externalId}`;

      if (this.itemsByKey.has(key)) {
        skippedDuplicates += 1;
        continue;
      }

      this.itemsByKey.set(key, item);
      inserted += 1;
    }

    return { inserted, skippedDuplicates };
  }

  all(): readonly SourceItem[] {
    return [...this.itemsByKey.values()];
  }
}

class FakeFeedProjection implements FeedProjectionPort {
  readonly commands: ProjectFeedItemsCommand[] = [];

  async project(command: ProjectFeedItemsCommand): Promise<ProjectFeedItemsResult> {
    this.commands.push(command);
    return { projected: command.sourceItems.length };
  }
}

class FakeScanAttemptRepository implements ScanAttemptRepositoryPort {
  private readonly attempts = new Map<string, ScanAttempt>();

  async save(attempt: ScanAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    this.attempts.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.scanJobId}`, attempt);
  }

  async findByScanJob(params: Parameters<ScanAttemptRepositoryPort['findByScanJob']>[0]): Promise<ScanAttempt | null> {
    return this.attempts.get(`${params.tenantId}:${params.workspaceId}:${params.scanJobId}`) ?? null;
  }
}

class FakeScanFailureQueue implements ScanFailureQueuePort {
  readonly retries: unknown[] = [];
  readonly deadLetters: unknown[] = [];

  async enqueueRetry(command: Parameters<ScanFailureQueuePort['enqueueRetry']>[0]): Promise<void> {
    this.retries.push(command);
  }

  async deadLetter(command: Parameters<ScanFailureQueuePort['deadLetter']>[0]): Promise<void> {
    this.deadLetters.push(command);
  }
}

describe('ExecuteScanUseCase', () => {
  it('fetches source items and persists new canonical items', async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const attempts = new FakeScanAttemptRepository();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      projection,
      attempts,
      new FakeScanFailureQueue(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
      sourceBindingId: 'source-binding-1',
      scanPolicyId: 'scan-policy-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'scan-job-1',
        fetched: 2,
        inserted: 2,
        skippedDuplicates: 0,
        projected: 2,
      },
    });
    expect(fetcher.calls).toHaveLength(1);
    expect(repository.all()).toHaveLength(2);
    expect(projection.commands).toHaveLength(1);
    await expect(attempts.findByScanJob({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
    })).resolves.toEqual(expect.objectContaining({
      toSnapshot: expect.any(Function),
    }));
    expect((await attempts.findByScanJob({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
    }))?.toSnapshot()).toMatchObject({
      status: 'succeeded',
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });
  });

  it('skips duplicate source items on replay', async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      new FakeFeedProjection(),
      new FakeScanAttemptRepository(),
      new FakeScanFailureQueue(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
      sourceBindingId: 'source-binding-1',
      scanPolicyId: 'scan-policy-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    };

    await useCase.execute(command);
    const result = await useCase.execute(command);

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'scan-job-1',
        fetched: 2,
        inserted: 0,
        skippedDuplicates: 2,
        projected: 2,
      },
    });
    expect(repository.all()).toHaveLength(2);
  });

  it('marks scan attempt as failed when provider fetch fails', async () => {
    const attempts = new FakeScanAttemptRepository();
    const failures = new FakeScanFailureQueue();
    const useCase = new ExecuteScanUseCase(
      new FailingSourceFetcher(),
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      attempts,
      failures,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-failed',
      sourceBindingId: 'source-binding-1',
      scanPolicyId: 'scan-policy-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });

    expect(result.ok).toBe(false);
    expect((await attempts.findByScanJob({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-failed',
    }))?.toSnapshot()).toMatchObject({
      status: 'failed',
      failureReason: 'Provider unavailable',
    });
    expect(failures.retries).toHaveLength(1);
    expect(failures.deadLetters).toHaveLength(0);
  });

  it('dead letters failed scan when retry budget is exhausted', async () => {
    const failures = new FakeScanFailureQueue();
    const useCase = new ExecuteScanUseCase(
      new FailingSourceFetcher(),
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      new FakeScanAttemptRepository(),
      failures,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-dead-letter',
      sourceBindingId: 'source-binding-1',
      scanPolicyId: 'scan-policy-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
      attemptNumber: 3,
      retryBudget: 3,
    });

    expect(result.ok).toBe(false);
    expect(failures.retries).toHaveLength(0);
    expect(failures.deadLetters).toHaveLength(1);
  });
});
