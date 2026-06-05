import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Topic } from '../domain';

export interface TopicRepositoryPort {
  save(topic: Topic): Promise<void>;
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
}
