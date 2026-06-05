import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBinding } from '../../domain';
import type { SourceBindingRepositoryPort } from '../../ports';

export class InMemorySourceBindingRepository implements SourceBindingRepositoryPort {
  private readonly bindingsByTopicProvider = new Map<string, SourceBinding>();
  private readonly bindingsById = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindingsByTopicProvider.set(
      this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.topicId, snapshot.providerKey),
      binding,
    );
    this.bindingsById.set(this.idKey(snapshot.tenantId, snapshot.workspaceId, snapshot.id), binding);
  }

  async findByTopicAndProvider(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
    providerKey: string;
  }): Promise<SourceBinding | null> {
    return (
      this.bindingsByTopicProvider.get(this.key(params.tenantId, params.workspaceId, params.topicId, params.providerKey)) ??
      null
    );
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<SourceBinding | null> {
    return this.bindingsById.get(this.idKey(params.tenantId, params.workspaceId, params.sourceBindingId)) ?? null;
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, topicId: string, providerKey: string): string {
    return `${tenantId}:${workspaceId}:${topicId}:${providerKey}`;
  }

  private idKey(tenantId: TenantId, workspaceId: WorkspaceId, sourceBindingId: string): string {
    return `${tenantId}:${workspaceId}:${sourceBindingId}`;
  }
}
