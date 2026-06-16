import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryDigestScheduleRepository } from '../../adapters/persistence/in-memory-digest-schedule.repository';
import { DigestSchedule, type DigestScheduleProps } from '../../domain';
import { ListDigestSchedulesUseCase } from './list-digest-schedules.use-case';

describe('ListDigestSchedulesUseCase', () => {
  it('lists tenant-scoped schedules in newest-first pages', async () => {
    const schedules = new InMemoryDigestScheduleRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await schedules.save(makeSchedule({
      id: 'digest-schedule-old',
      tenantId: tenant,
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));
    await schedules.save(makeSchedule({
      id: 'digest-schedule-new',
      tenantId: tenant,
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T01:00:00.000Z'),
    }));
    await schedules.save(makeSchedule({
      id: 'digest-schedule-other-tenant',
      tenantId: tenantId('tenant-2'),
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T02:00:00.000Z'),
    }));

    const firstPage = await new ListDigestSchedulesUseCase(schedules).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
    });

    expect(firstPage).toEqual({
      ok: true,
      value: {
        schedules: [
          expect.objectContaining({
            id: 'digest-schedule-new',
            tenantId: tenant,
            workspaceId: workspace,
          }),
        ],
        nextCursor: expect.any(String),
      },
    });

    if (!firstPage.ok) {
      throw firstPage.error;
    }

    const secondPage = await new ListDigestSchedulesUseCase(schedules).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
      cursor: firstPage.value.nextCursor,
    });

    expect(secondPage).toEqual({
      ok: true,
      value: {
        schedules: [
          expect.objectContaining({
            id: 'digest-schedule-old',
            tenantId: tenant,
            workspaceId: workspace,
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it('rejects unsafe limits', async () => {
    await expect(new ListDigestSchedulesUseCase(new InMemoryDigestScheduleRepository()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 0,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

const makeSchedule = (overrides: Partial<DigestScheduleProps> = {}): DigestSchedule => DigestSchedule.create({
  id: 'digest-schedule-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  recipientKey: 'user-1',
  channel: 'email',
  topicIds: ['topic-a'],
  intervalSeconds: 3600,
  includeNoSignal: false,
  nextRunAt: new Date('2026-06-06T01:00:00.000Z'),
  createdAt: new Date('2026-06-06T00:00:00.000Z'),
  status: 'enabled',
  ...overrides,
});
