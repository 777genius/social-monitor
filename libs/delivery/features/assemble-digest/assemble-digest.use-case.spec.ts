import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttempt, Digest } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  DigestRepositoryPort,
  DigestSourceReaderPort,
  DigestSourceWindowQuery,
  DigestSourceWindowResult,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
} from '../../ports';
import { QueueDeliveryAttemptUseCase } from '../queue-delivery-attempt/queue-delivery-attempt.use-case';
import { AssembleDigestUseCase } from './assemble-digest.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeDigests implements DigestRepositoryPort {
  private readonly digestsById = new Map<string, Digest>();
  private readonly digestsByWindow = new Map<string, Digest>();

  async save(digest: Digest): Promise<void> {
    const snapshot = digest.toSnapshot();

    this.digestsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, digest);
    this.digestsByWindow.set(
      [
        snapshot.tenantId,
        snapshot.workspaceId,
        snapshot.recipientKey,
        snapshot.channel,
        snapshot.window.windowId,
      ].join(':'),
      digest,
    );
  }

  async findById(params: Parameters<DigestRepositoryPort['findById']>[0]): Promise<Digest | null> {
    return this.digestsById.get(`${params.tenantId}:${params.workspaceId}:${params.digestId}`) ?? null;
  }

  async findByWindow(params: Parameters<DigestRepositoryPort['findByWindow']>[0]): Promise<Digest | null> {
    return this.digestsByWindow.get([
      params.tenantId,
      params.workspaceId,
      params.recipientKey,
      params.channel,
      params.windowId,
    ].join(':')) ?? null;
  }
}

class FakeDigestSources implements DigestSourceReaderPort {
  constructor(private readonly result: DigestSourceWindowResult) {}

  async readWindow(query: DigestSourceWindowQuery): Promise<DigestSourceWindowResult> {
    const interestIds = new Set(query.interestIds);

    return {
      summaries: this.result.summaries.filter(
        (summary) =>
          summary.tenantId === query.tenantId &&
          summary.workspaceId === query.workspaceId &&
          interestIds.has(summary.interestId),
      ),
      feedItems: this.result.feedItems.filter(
        (feedItem) =>
          feedItem.tenantId === query.tenantId &&
          feedItem.workspaceId === query.workspaceId &&
          interestIds.has(feedItem.interestId),
      ),
    };
  }
}

class FakeDeliveryAttempts implements DeliveryAttemptRepositoryPort {
  private readonly attemptsById = new Map<string, DeliveryAttempt>();
  private readonly attemptsByIdempotencyKey = new Map<string, DeliveryAttempt>();

  async save(attempt: DeliveryAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();

    this.attemptsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, attempt);
    this.attemptsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      attempt,
    );
  }

  async findById(params: Parameters<DeliveryAttemptRepositoryPort['findById']>[0]): Promise<DeliveryAttempt | null> {
    return this.attemptsById.get(`${params.tenantId}:${params.workspaceId}:${params.deliveryAttemptId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<DeliveryAttemptRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<DeliveryAttempt | null> {
    return this.attemptsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  async findQueued(): Promise<readonly DeliveryAttempt[]> {
    return [];
  }

  async list(query: ListDeliveryAttemptsQuery): Promise<ListDeliveryAttemptsResult> {
    return {
      attempts: [...this.attemptsById.values()].filter((attempt) => {
        const snapshot = attempt.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}

describe('AssembleDigestUseCase', () => {
  it('assembles digest provenance and queues delivery idempotently', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const attempts = new FakeDeliveryAttempts();
    const useCase = new AssembleDigestUseCase(
      new FakeDigests(),
      new FakeDigestSources({
        summaries: [
          {
            tenantId: tenant,
            workspaceId: workspace,
            summaryId: 'summary-1',
            interestId: 'interest-1',
            sourceWindowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
            sourceWindowEndedAt: new Date('2026-06-06T01:00:00.000Z'),
            signal: 'high',
          },
        ],
        feedItems: [
          {
            tenantId: tenant,
            workspaceId: workspace,
            feedItemId: 'feed-item-1',
            interestId: 'interest-1',
            observedAt: new Date('2026-06-06T00:30:00.000Z'),
            signal: 'normal',
          },
        ],
      }),
      new QueueDeliveryAttemptUseCase(
        attempts,
        new SequenceIdGenerator(),
        new FixedClock(new Date('2026-06-06T01:01:00.000Z')),
      ),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
    );
    const command = {
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      channel: 'email' as const,
      interestIds: ['interest-1'],
      windowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      windowEndedAt: new Date('2026-06-06T02:00:00.000Z'),
      includeNoSignal: false,
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      throw new Error('Expected digest assembly to succeed');
    }

    expect(first.value.created).toBe(true);
    expect(first.value.deliveryAttemptId).toBe('id-1');
    expect(first.value.digest).toMatchObject({
      id: 'id-1',
      status: 'assembled',
      summaryIds: ['summary-1'],
      feedItemIds: ['feed-item-1'],
      provenance: [
        {
          resourceType: 'feed_item',
          resourceId: 'feed-item-1',
          interestId: 'interest-1',
          includedReason: 'within_window',
        },
        {
          resourceType: 'summary',
          resourceId: 'summary-1',
          interestId: 'interest-1',
          includedReason: 'high_signal',
        },
      ],
    });
    expect(second.value).toEqual({
      digest: first.value.digest,
      created: false,
    });
  });

  it('keeps an empty digest without queueing delivery when no-signal is excluded', async () => {
    const tenant = tenantId('tenant-2');
    const workspace = workspaceId('workspace-2');
    const useCase = new AssembleDigestUseCase(
      new FakeDigests(),
      new FakeDigestSources({
        summaries: [
          {
            tenantId: tenant,
            workspaceId: workspace,
            summaryId: 'summary-no-signal',
            interestId: 'interest-1',
            sourceWindowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
            sourceWindowEndedAt: new Date('2026-06-06T01:00:00.000Z'),
            signal: 'no_signal',
          },
        ],
        feedItems: [],
      }),
      new QueueDeliveryAttemptUseCase(
        new FakeDeliveryAttempts(),
        new SequenceIdGenerator(),
        new FixedClock(new Date('2026-06-06T01:01:00.000Z')),
      ),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-2',
      channel: 'in_app',
      interestIds: ['interest-1'],
      windowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      windowEndedAt: new Date('2026-06-06T02:00:00.000Z'),
      includeNoSignal: false,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected empty digest assembly to succeed');
    }

    expect(result.value).toMatchObject({
      created: true,
      digest: {
        status: 'empty',
        summaryIds: [],
        feedItemIds: [],
        provenance: [],
      },
    });
    expect(result.value.deliveryAttemptId).toBeUndefined();
  });
});
