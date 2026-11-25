import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { IdempotencyPort, IdempotencyRecord } from '../../ports';
import { InMemoryInterestCreationState, monitoringReceiptKey } from '../persistence/in-memory-interest-creation-state';

export class InMemoryIdempotencyAdapter implements IdempotencyPort {
  constructor(private readonly state = new InMemoryInterestCreationState()) {}

  private get records() { return this.state.receipts; }

  async get<TValue>(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
  }): Promise<IdempotencyRecord<TValue> | null> {
    const value = this.records.get(this.key(params));
    return value === undefined || value === null ? null : { value: value as TValue };
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
    return monitoringReceiptKey(params);
  }
}
