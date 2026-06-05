import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanPolicy } from '../../domain';
import type { ScanPolicyRepositoryPort } from '../../ports';

export class InMemoryScanPolicyRepository implements ScanPolicyRepositoryPort {
  private readonly policies = new Map<string, ScanPolicy>();

  async save(policy: ScanPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policies.set(this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.sourceBindingId), policy);
  }

  async findBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanPolicy | null> {
    return this.policies.get(this.key(params.tenantId, params.workspaceId, params.sourceBindingId)) ?? null;
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, sourceBindingId: string): string {
    return `${tenantId}:${workspaceId}:${sourceBindingId}`;
  }
}
