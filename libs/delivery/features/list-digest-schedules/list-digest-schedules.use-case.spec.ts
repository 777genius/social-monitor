import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DigestSchedule, type DigestScheduleProps } from '../../domain';
import type {
  DigestScheduleRepositoryPort,
  FindDueDigestSchedulesQuery,
  ListDigestSchedulesQuery,
  ListDigestSchedulesResult,
} from '../../ports';
import { ListDigestSchedulesUseCase } from './list-digest-schedules.use-case';

describe('ListDigestSchedulesUseCase', () => {
  it('lists tenant-scoped schedules in newest-first pages', async () => {
    const schedules = new FakeDigestScheduleRepository();
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
    await expect(new ListDigestSchedulesUseCase(new FakeDigestScheduleRepository()).execute({
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
    const offset = parseCursor(query.cursor);
    const allSchedules = [...this.schedules.values()]
      .filter((schedule) => {
        const snapshot = schedule.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareSchedulesByCreation);
    const schedules = allSchedules.slice(offset, offset + query.limit);
    const nextOffset = offset + schedules.length;

    return {
      schedules,
      nextCursor: nextOffset < allSchedules.length ? encodeCursor(nextOffset) : undefined,
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

const compareSchedulesByCreation = (left: DigestSchedule, right: DigestSchedule): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

  return typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) ? parsed.offset : 0;
};
