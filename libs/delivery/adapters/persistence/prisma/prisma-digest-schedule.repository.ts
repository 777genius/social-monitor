import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { DigestSchedule } from '../../../domain';
import type {
  DigestScheduleRepositoryPort,
  FindDueDigestSchedulesQuery,
  ListDigestSchedulesQuery,
  ListDigestSchedulesResult,
} from '../../../ports';
import type { PrismaDeliveryClient, PrismaDigestScheduleWriteData } from './prisma-delivery-client';
import { digestScheduleFromPrisma, digestScheduleStatusToPrisma } from './prisma-delivery-records';

export class PrismaDigestScheduleRepository implements DigestScheduleRepositoryPort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async save(schedule: DigestSchedule): Promise<void> {
    const snapshot = schedule.toSnapshot();
    const data: PrismaDigestScheduleWriteData = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      recipientKey: snapshot.recipientKey,
      channel: snapshot.channel,
      interestIds: snapshot.interestIds,
      intervalSeconds: snapshot.intervalSeconds,
      includeNoSignal: snapshot.includeNoSignal,
      nextRunAt: snapshot.nextRunAt,
      createdAt: snapshot.createdAt,
      status: digestScheduleStatusToPrisma(snapshot.status),
    };

    await withPrismaWriteRetry(() => this.prisma.digestSchedule.upsert({
      where: { id: snapshot.id },
      update: data,
      create: {
        id: snapshot.id,
        ...data,
      },
    }));
  }

  async findById(params: Parameters<DigestScheduleRepositoryPort['findById']>[0]): Promise<DigestSchedule | null> {
    const record = await this.prisma.digestSchedule.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.digestScheduleId,
      },
    });

    return record === null ? null : digestScheduleFromPrisma(record);
  }

  async list(query: ListDigestSchedulesQuery): Promise<ListDigestSchedulesResult> {
    const offset = parseCursor(query.cursor);
    const limit = Math.max(1, Math.min(query.limit, 100));
    const records = await this.prisma.digestSchedule.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit + 1,
    });
    const schedules = records.slice(0, limit).map(digestScheduleFromPrisma);
    const nextOffset = offset + schedules.length;

    return {
      schedules,
      nextCursor: records.length > limit ? encodeCursor(nextOffset) : undefined,
    };
  }

  async findDue(query: FindDueDigestSchedulesQuery): Promise<readonly DigestSchedule[]> {
    const records = await this.prisma.digestSchedule.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        status: 'ENABLED',
        nextRunAt: { lte: query.now },
      },
      orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(query.limit, 100)),
    });

    return records.map(digestScheduleFromPrisma);
  }
}

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
