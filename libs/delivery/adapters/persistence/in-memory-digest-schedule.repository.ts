import type { DigestSchedule } from '../../domain';
import type {
  DigestScheduleRepositoryPort,
  FindDueDigestSchedulesQuery,
  ListDigestSchedulesQuery,
  ListDigestSchedulesResult,
} from '../../ports';

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

  async list(query: ListDigestSchedulesQuery): Promise<ListDigestSchedulesResult> {
    const offset = parseCursor(query.cursor);
    const allSchedules = [...this.schedulesById.values()]
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

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
