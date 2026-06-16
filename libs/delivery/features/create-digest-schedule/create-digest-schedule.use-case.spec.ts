import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryDigestScheduleRepository } from '../../adapters/persistence/in-memory-digest-schedule.repository';
import { type DeliveryChannel } from '../../domain';
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
    const schedules = new InMemoryDigestScheduleRepository();
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
    const schedules = new InMemoryDigestScheduleRepository();
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
      new InMemoryDigestScheduleRepository(),
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
