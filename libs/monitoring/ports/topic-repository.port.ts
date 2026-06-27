import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Topic } from '../domain';

export type ListTopicsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListTopicsResult = {
  readonly topics: readonly Topic[];
  readonly nextCursor?: string;
};

export type ArchiveTopicParams = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly archivedAt: Date;
};

export interface TopicRepositoryPort {
  save(topic: Topic): Promise<void>;
  archive?(params: ArchiveTopicParams): Promise<void>;
  findByName(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Topic | null>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
  }): Promise<Topic | null>;
  list(query: ListTopicsQuery): Promise<ListTopicsResult>;
}
