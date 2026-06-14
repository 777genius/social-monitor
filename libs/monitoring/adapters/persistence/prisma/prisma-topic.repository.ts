import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Topic } from '../../../domain';
import type { TopicRepositoryPort } from '../../../ports';
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
}
