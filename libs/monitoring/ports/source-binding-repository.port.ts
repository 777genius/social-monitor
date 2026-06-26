import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBinding, SourceBindingStatus } from '../domain';

export type ListSourceBindingsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly providerKeys?: readonly string[];
  readonly statuses?: readonly SourceBindingStatus[];
};

export type ListSourceBindingsResult = {
  readonly sourceBindings: readonly SourceBinding[];
  readonly nextCursor?: string;
};

export interface SourceBindingRepositoryPort {
  save(binding: SourceBinding): Promise<void>;
  findByTopicAndProvider(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
    providerKey: string;
  }): Promise<SourceBinding | null>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<SourceBinding | null>;
  listByTopic(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult>;
}
