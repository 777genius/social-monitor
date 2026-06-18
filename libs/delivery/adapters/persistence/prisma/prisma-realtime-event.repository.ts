import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { encodeRealtimeReplayCursor, parseRealtimeReplayCursor, type RealtimeEvent } from '../../../domain';
import {
  RealtimeEventSequenceConflictError,
  type ListRealtimeEventsQuery,
  type ListRealtimeEventsResult,
  type RealtimeEventRepositoryPort,
} from '../../../ports';
import type { PrismaDeliveryClient, PrismaRealtimeEventWriteData } from './prisma-delivery-client';
import { realtimeEventFromPrisma } from './prisma-delivery-records';

export class PrismaRealtimeEventRepository implements RealtimeEventRepositoryPort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async nextSequence(params: Parameters<RealtimeEventRepositoryPort['nextSequence']>[0]): Promise<number> {
    const latest = await this.prisma.realtimeEvent.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        channel: params.channel,
      },
      orderBy: { sequence: 'desc' },
    });

    return (latest?.sequence ?? 0) + 1;
  }

  async append(event: RealtimeEvent): Promise<void> {
    const snapshot = event.toSnapshot();
    const data: PrismaRealtimeEventWriteData = {
      protocolVersion: snapshot.protocolVersion,
      eventType: snapshot.eventType,
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      channel: snapshot.channel,
      resourceType: snapshot.resourceType,
      resourceId: snapshot.resourceId,
      sequence: snapshot.sequence,
      replayCursor: snapshot.replayCursor,
      occurredAt: snapshot.occurredAt,
      correlationId: snapshot.correlationId,
      payload: snapshot.payload,
    };

    try {
      await withPrismaWriteRetry(() => this.prisma.realtimeEvent.create({
        data: {
          id: snapshot.id,
          ...data,
        },
      }));
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new RealtimeEventSequenceConflictError();
      }

      throw error;
    }
  }

  async list(query: ListRealtimeEventsQuery): Promise<ListRealtimeEventsResult> {
    const cursor = parseRealtimeReplayCursor(query.cursor);

    if (cursor === null) {
      return {
        events: [],
        resyncRequired: true,
      };
    }

    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      channel: query.channel,
    };
    const latest = await this.prisma.realtimeEvent.findFirst({
      where,
      orderBy: { sequence: 'desc' },
    });
    const latestSequence = latest?.sequence ?? 0;

    if (cursor.afterSequence > latestSequence) {
      return {
        events: [],
        resyncRequired: true,
      };
    }

    const records = await this.prisma.realtimeEvent.findMany({
      where: {
        ...where,
        sequence: { gt: cursor.afterSequence },
      },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(query.limit, 100)),
    });
    const events = records.map(realtimeEventFromPrisma);
    const lastSelectedSequence = events.at(-1)?.toSnapshot().sequence;

    return {
      events,
      nextCursor: lastSelectedSequence !== undefined && lastSelectedSequence < latestSequence
        ? encodeRealtimeReplayCursor(lastSelectedSequence)
        : undefined,
      resyncRequired: false,
    };
  }
}

const isUniqueConstraintViolation = (error: unknown): boolean => {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const code = (error as { readonly code?: unknown }).code;

  return code === 'P2002';
};
