import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { IdempotencyPort, IdempotencyRecord } from '../../ports';

export class InMemoryIdempotencyAdapter implements IdempotencyPort {
  private readonly records = new Map<string, unknown>();

  async get<TValue>(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
  }): Promise<IdempotencyRecord<TValue> | null> {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
    value: TValue;
  }): Promise<void> {
    this.records.set(this.key(params), params.value);
  }

  private key(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
  }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}
