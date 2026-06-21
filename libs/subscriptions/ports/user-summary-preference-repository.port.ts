import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { UserSummaryPreference } from '../domain';

export interface UserSummaryPreferenceRepositoryPort {
  save(preference: UserSummaryPreference): Promise<void>;
  findBySubscription(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly userId: string;
    readonly subscriptionId: string;
  }): Promise<UserSummaryPreference | null>;
  findByTopic(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly userId: string;
    readonly topicId: string;
  }): Promise<UserSummaryPreference | null>;
  findEffective(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly userId: string;
    readonly subscriptionId?: string;
    readonly topicId: string;
  }): Promise<UserSummaryPreference | null>;
}
