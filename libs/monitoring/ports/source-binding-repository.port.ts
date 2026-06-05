import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBinding } from '../domain';

export interface SourceBindingRepositoryPort {
  save(binding: SourceBinding): Promise<void>;
  findByTopicAndProvider(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
    providerKey: string;
  }): Promise<SourceBinding | null>;
}
