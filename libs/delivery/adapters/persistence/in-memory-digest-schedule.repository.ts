import type { DigestSchedule } from '../../domain';
import type { DigestScheduleRepositoryPort, FindDueDigestSchedulesQuery } from '../../ports';

export class InMemoryDigestScheduleRepository implements DigestScheduleRepositoryPort {
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
      .sort(compareSchedules)
      .slice(0, query.limit);
  }
}

const compareSchedules = (left: DigestSchedule, right: DigestSchedule): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const nextRunDiff = leftSnapshot.nextRunAt.getTime() - rightSnapshot.nextRunAt.getTime();

  if (nextRunDiff !== 0) {
    return nextRunDiff;
  }

  return leftSnapshot.id.localeCompare(rightSnapshot.id);
};
