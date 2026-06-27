import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Topic } from '../../domain';
import type { ArchiveTopicParams, ListTopicsQuery, ListTopicsResult, TopicRepositoryPort } from '../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from './offset-pagination';

export class InMemoryTopicRepository implements TopicRepositoryPort {
  private readonly topics = new Map<string, Topic>();

  async save(topic: Topic): Promise<void> {
    const snapshot = topic.toSnapshot();
    this.topics.set(this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.id), topic);
  }

  async archive(params: ArchiveTopicParams): Promise<void> {
    this.topics.delete(this.key(params.tenantId, params.workspaceId, params.topicId));
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

  async list(query: ListTopicsQuery): Promise<ListTopicsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const allTopics = [...this.topics.values()]
      .filter((topic) => {
        const snapshot = topic.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareTopicsByCreation);
    const topics = allTopics.slice(offset, offset + query.limit);
    const nextOffset = offset + topics.length;

    return {
      topics,
      nextCursor: nextOffset < allTopics.length ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, topicId: string): string {
    return `${tenantId}:${workspaceId}:${topicId}`;
  }
}

const compareTopicsByCreation = (left: Topic, right: Topic): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};
