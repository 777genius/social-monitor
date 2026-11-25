import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DigestSchedule } from '../../domain';
import type {
  Digest,
  DeliveryAttempt,
} from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  DigestRepositoryPort,
  DigestScheduleRepositoryPort,
  DigestSourceReaderPort,
  DigestSourceWindowQuery,
  DigestSourceWindowResult,
  FindDueDigestSchedulesQuery,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
  ListDigestSchedulesQuery,
  ListDigestSchedulesResult,
} from '../../ports';
import { AssembleDigestUseCase } from '../assemble-digest/assemble-digest.use-case';
import { QueueDeliveryAttemptUseCase } from '../queue-delivery-attempt/queue-delivery-attempt.use-case';
import { ScheduleDueDigestsUseCase } from './schedule-due-digests.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeDigestSchedules implements DigestScheduleRepositoryPort {
  private readonly schedulesById = new Map<string, DigestSchedule>();

  add(schedule: DigestSchedule): void {
    const snapshot = schedule.toSnapshot();
    this.schedulesById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, schedule);
  }

  async save(schedule: DigestSchedule): Promise<void> {
    this.add(schedule);
  }

  async findById(params: Parameters<DigestScheduleRepositoryPort['findById']>[0]): Promise<DigestSchedule | null> {
    return this.schedulesById.get(`${params.tenantId}:${params.workspaceId}:${params.digestScheduleId}`) ?? null;
  }

  async list(query: ListDigestSchedulesQuery): Promise<ListDigestSchedulesResult> {
    return {
      schedules: [...this.schedulesById.values()].filter((schedule) => {
        const snapshot = schedule.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }

  async findDue(query: FindDueDigestSchedulesQuery): Promise<readonly DigestSchedule[]> {
    return [...this.schedulesById.values()]
      .filter((schedule) => {
        const snapshot = schedule.toSnapshot();

        return (
          snapshot.status === 'enabled' &&
          (query.tenantId === undefined || snapshot.tenantId === query.tenantId) &&
          (query.workspaceId === undefined || snapshot.workspaceId === query.workspaceId) &&
          snapshot.nextRunAt.getTime() <= query.now.getTime()
        );
      })
      .slice(0, query.limit);
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

class FakeSources implements DigestSourceReaderPort {
  async readWindow(query: DigestSourceWindowQuery): Promise<DigestSourceWindowResult> {
    return {
      summaries: [
        {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          summaryId: 'summary-1',
          interestId: query.interestIds[0] ?? 'interest-1',
          sourceWindowStartedAt: query.startedAt,
          sourceWindowEndedAt: new Date(query.endedAt.getTime() - 1),
          signal: 'high',
        },
      ],
      feedItems: [],
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

describe('ScheduleDueDigestsUseCase', () => {
  it('assembles due digest and advances schedule window', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const schedules = new FakeDigestSchedules();

    schedules.add(DigestSchedule.create({
      id: 'digest-schedule-1',
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      channel: 'email',
      interestIds: ['interest-1'],
      intervalSeconds: 3600,
      includeNoSignal: false,
      nextRunAt: new Date('2026-06-06T01:00:00.000Z'),
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));

    const result = await new ScheduleDueDigestsUseCase(
      schedules,
      new AssembleDigestUseCase(
        new FakeDigests(),
        new FakeSources(),
        new QueueDeliveryAttemptUseCase(
          new FakeDeliveryAttempts(),
          new SequenceIdGenerator(),
          new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
        ),
        new SequenceIdGenerator(),
        new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
      ),
      new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-06T01:00:00.000Z'),
        evaluated: 1,
        assembled: 1,
        skipped: 0,
        digests: [
          {
            digestScheduleId: 'digest-schedule-1',
            digestId: 'id-1',
            deliveryAttemptId: 'id-1',
            created: true,
          },
        ],
      },
    });
    expect((await schedules.findById({
      tenantId: tenant,
      workspaceId: workspace,
      digestScheduleId: 'digest-schedule-1',
    }))?.toSnapshot()).toMatchObject({
      nextRunAt: new Date('2026-06-06T02:00:00.000Z'),
    });
  });
});
