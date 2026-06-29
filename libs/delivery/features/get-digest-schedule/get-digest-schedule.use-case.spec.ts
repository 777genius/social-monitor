import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DigestSchedule, type DigestScheduleProps } from '../../domain';
import type {
  DigestScheduleRepositoryPort,
  FindDueDigestSchedulesQuery,
  ListDigestSchedulesQuery,
  ListDigestSchedulesResult,
} from '../../ports';
import { GetDigestScheduleUseCase } from './get-digest-schedule.use-case';

describe('GetDigestScheduleUseCase', () => {
  it('returns digest schedule metadata for the requested tenant and workspace', async () => {
    const schedules = new FakeDigestScheduleRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await schedules.save(makeSchedule({ tenantId: tenant, workspaceId: workspace }));

    const result = await new GetDigestScheduleUseCase(schedules).execute({
      tenantId: tenant,
      workspaceId: workspace,
      digestScheduleId: 'digest-schedule-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'digest-schedule-1',
        tenantId: tenant,
        workspaceId: workspace,
        recipientKey: 'user-1',
        interestIds: ['interest-a'],
        nextRunAt: '2026-06-06T01:00:00.000Z',
      }),
    });
  });

  it('does not return schedules outside the requested tenant', async () => {
    const schedules = new FakeDigestScheduleRepository();
    await schedules.save(makeSchedule({ tenantId: tenantId('tenant-2') }));

    await expect(new GetDigestScheduleUseCase(schedules).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      digestScheduleId: 'digest-schedule-1',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });

  it('rejects blank digest schedule ids before repository lookup', async () => {
    await expect(new GetDigestScheduleUseCase(new FakeDigestScheduleRepository()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      digestScheduleId: ' ',
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
  interestIds: ['interest-a'],
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
    const schedules = [...this.schedules.values()]
      .filter((schedule) => {
        const snapshot = schedule.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .slice(0, query.limit);

    return {
      schedules,
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
