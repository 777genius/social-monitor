import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { UserSubscriptionSchedule } from '../domain';

export interface UserSubscriptionScheduleRepositoryPort {
  save(schedule: UserSubscriptionSchedule): Promise<void>;
  findBySubscription(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly subscriptionId: string;
  }): Promise<UserSubscriptionSchedule | null>;
}
