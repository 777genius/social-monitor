import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SourceItem } from '../../domain';
import type {
  FetchSourceItemsCommand,
  FetchedSourceItem,
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
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

describe('ExecuteScanUseCase', () => {
  it('fetches source items and persists new canonical items', async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      projection,
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
  });

  it('skips duplicate source items on replay', async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      new FakeFeedProjection(),
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
});
