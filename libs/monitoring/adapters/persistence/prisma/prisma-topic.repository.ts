import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Topic } from '../../../domain';
import type { ListTopicsQuery, ListTopicsResult, TopicRepositoryPort } from '../../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from '../offset-pagination';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { topicFromPrisma } from './prisma-monitoring-records';

export class PrismaTopicRepository implements TopicRepositoryPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async save(topic: Topic): Promise<void> {
    const snapshot = topic.toSnapshot();

    await this.prisma.topic.upsert({
      where: { id: snapshot.id },
      update: {
        name: snapshot.name,
        query: snapshot.query,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        name: snapshot.name,
        query: snapshot.query,
      },
    });
  }

  async findByName(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Topic | null> {
    const record = await this.prisma.topic.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        name: params.name.trim(),
        deletedAt: null,
      },
    });

    return record === null ? null : topicFromPrisma(record);
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
  }): Promise<Topic | null> {
    const record = await this.prisma.topic.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.topicId,
        deletedAt: null,
      },
    });

    return record === null ? null : topicFromPrisma(record);
  }

  async list(query: ListTopicsQuery): Promise<ListTopicsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const limit = Math.max(1, Math.min(query.limit, 100));
    const records = await this.prisma.topic.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit + 1,
    });
    const topics = records.slice(0, limit).map(topicFromPrisma);
    const nextOffset = offset + topics.length;

    return {
      topics,
      nextCursor: records.length > limit ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }
}
