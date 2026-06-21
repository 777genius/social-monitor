import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { UserSubscription } from '../domain';

export type ListUserSubscriptionsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListUserSubscriptionsResult = {
  readonly subscriptions: readonly UserSubscription[];
  readonly nextCursor?: string;
};

export interface UserSubscriptionRepositoryPort {
  save(subscription: UserSubscription): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly subscriptionId: string;
  }): Promise<UserSubscription | null>;
  findByUserAndTarget(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly userId: string;
    readonly sourceTargetId: string;
  }): Promise<UserSubscription | null>;
  listByUser(query: ListUserSubscriptionsQuery): Promise<ListUserSubscriptionsResult>;
}
