import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { DigestSchedule} from '../../domain';
import { type DeliveryChannel } from '../../domain';
import type {
  DigestScheduleRepositoryPort,
  FindDueDigestSchedulesQuery,
  ListDigestSchedulesQuery,
  ListDigestSchedulesResult,
} from '../../ports';
import { CreateDigestScheduleUseCase } from './create-digest-schedule.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `digest-schedule-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe('CreateDigestScheduleUseCase', () => {
  it('creates a normalized digest schedule with default next run time', async () => {
    const schedules = new FakeDigestScheduleRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const result = await new CreateDigestScheduleUseCase(
      schedules,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      channel: 'in_app',
      topicIds: ['topic-b', 'topic-a', 'topic-a'],
      intervalSeconds: 3600,
      includeNoSignal: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        created: true,
        schedule: expect.objectContaining({
          id: 'digest-schedule-1',
          tenantId: tenant,
          workspaceId: workspace,
          recipientKey: 'user-1',
          channel: 'in_app',
          topicIds: ['topic-a', 'topic-b'],
          intervalSeconds: 3600,
          includeNoSignal: true,
          nextRunAt: '2026-06-06T01:00:00.000Z',
          createdAt: '2026-06-06T00:00:00.000Z',
          status: 'enabled',
        }),
      },
    });
    await expect(schedules.findById({
      tenantId: tenant,
      workspaceId: workspace,
      digestScheduleId: 'digest-schedule-1',
    })).resolves.not.toBeNull();
  });

  it('rejects unsupported channels before saving', async () => {
    const schedules = new FakeDigestScheduleRepository();
    const result = await new CreateDigestScheduleUseCase(
      schedules,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'sms' as DeliveryChannel,
      topicIds: ['topic-a'],
      intervalSeconds: 3600,
      includeNoSignal: false,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          channel: 'sms',
        },
      }),
    });
    await expect(schedules.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    })).resolves.toEqual({
      schedules: [],
      nextCursor: undefined,
    });
  });

  it('rejects unsafe intervals', async () => {
    const result = await new CreateDigestScheduleUseCase(
      new FakeDigestScheduleRepository(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      topicIds: ['topic-a'],
      intervalSeconds: 59,
      includeNoSignal: false,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

class FakeDigestScheduleRepository implements DigestScheduleRepositoryPort {
  private readonly schedules = new Map<string, DigestSchedule>();

  async save(schedule: DigestSchedule): Promise<void> {
    const snapshot = schedule.toSnapshot();

    this.schedules.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, schedule);
  }

  async findById(params: Parameters<DigestScheduleRepositoryPort['findById']>[0]): Promise<DigestSchedule | null> {
    return this.schedules.get(`${params.tenantId}:${params.workspaceId}:${params.digestScheduleId}`) ?? null;
  }

  async list(query: ListDigestSchedulesQuery): Promise<ListDigestSchedulesResult> {
    return {
      schedules: [...this.schedules.values()].filter((schedule) => {
        const snapshot = schedule.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }

  async findDue(query: FindDueDigestSchedulesQuery): Promise<readonly DigestSchedule[]> {
    return [...this.schedules.values()]
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
