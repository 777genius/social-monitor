import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttempt } from '../domain';

export type ListDeliveryAttemptsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListDeliveryAttemptsResult = {
  readonly attempts: readonly DeliveryAttempt[];
  readonly nextCursor?: string;
};

export interface DeliveryAttemptRepositoryPort {
  save(attempt: DeliveryAttempt): Promise<void>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    deliveryAttemptId: string;
  }): Promise<DeliveryAttempt | null>;
  findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<DeliveryAttempt | null>;
  list(query: ListDeliveryAttemptsQuery): Promise<ListDeliveryAttemptsResult>;
}
