import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Topic } from '../../domain';
import type { TopicRepositoryPort } from '../../ports';

export class InMemoryTopicRepository implements TopicRepositoryPort {
  private readonly topics = new Map<string, Topic>();

  async save(topic: Topic): Promise<void> {
    const snapshot = topic.toSnapshot();
    this.topics.set(this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.id), topic);
  }

  async findByName(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Topic | null> {
    const normalizedName = params.name.trim().toLowerCase();

    for (const topic of this.topics.values()) {
      const snapshot = topic.toSnapshot();
      if (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name.toLowerCase() === normalizedName
      ) {
        return topic;
      }
    }

    return null;
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
  }): Promise<Topic | null> {
    return this.topics.get(this.key(params.tenantId, params.workspaceId, params.topicId)) ?? null;
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, topicId: string): string {
    return `${tenantId}:${workspaceId}:${topicId}`;
  }
}
