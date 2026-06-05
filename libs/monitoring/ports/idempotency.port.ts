import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type IdempotencyRecord<TValue> = {
  readonly value: TValue;
};

export interface IdempotencyPort {
  get<TValue>(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
  }): Promise<IdempotencyRecord<TValue> | null>;

  set<TValue>(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
    value: TValue;
  }): Promise<void>;
}
