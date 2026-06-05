import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBinding } from '../../domain';
import type { SourceBindingRepositoryPort } from '../../ports';

export class InMemorySourceBindingRepository implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindings.set(
      this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.topicId, snapshot.providerKey),
      binding,
    );
  }

  async findByTopicAndProvider(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
    providerKey: string;
  }): Promise<SourceBinding | null> {
    return this.bindings.get(this.key(params.tenantId, params.workspaceId, params.topicId, params.providerKey)) ?? null;
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, topicId: string, providerKey: string): string {
    return `${tenantId}:${workspaceId}:${topicId}:${providerKey}`;
  }
}
