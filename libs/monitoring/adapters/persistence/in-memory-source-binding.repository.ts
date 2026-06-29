import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBinding } from '../../domain';
import type {
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  SourceBindingRepositoryPort,
} from '../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from './offset-pagination';

export class InMemorySourceBindingRepository implements SourceBindingRepositoryPort {
  private readonly bindingsByInterestProvider = new Map<string, SourceBinding>();
  private readonly bindingsById = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindingsByInterestProvider.set(
      this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.interestId, snapshot.providerKey),
      binding,
    );
    this.bindingsById.set(this.idKey(snapshot.tenantId, snapshot.workspaceId, snapshot.id), binding);
  }

  async findByInterestAndProvider(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    interestId: string;
    providerKey: string;
  }): Promise<SourceBinding | null> {
    return (
      this.bindingsByInterestProvider.get(this.key(params.tenantId, params.workspaceId, params.interestId, params.providerKey)) ??
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

  async listByInterest(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const allBindings = [...this.bindingsById.values()]
      .filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.interestId === query.interestId &&
          (query.providerKeys === undefined ||
            query.providerKeys.includes(snapshot.providerKey)) &&
          (query.statuses === undefined ||
            query.statuses.includes(snapshot.status))
        );
      })
      .sort(compareSourceBindingsByCreation);
    const sourceBindings = allBindings.slice(offset, offset + query.limit);
    const nextOffset = offset + sourceBindings.length;

    return {
      sourceBindings,
      nextCursor: nextOffset < allBindings.length ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, interestId: string, providerKey: string): string {
    return `${tenantId}:${workspaceId}:${interestId}:${providerKey}`;
  }

  private idKey(tenantId: TenantId, workspaceId: WorkspaceId, sourceBindingId: string): string {
    return `${tenantId}:${workspaceId}:${sourceBindingId}`;
  }
}

const compareSourceBindingsByCreation = (left: SourceBinding, right: SourceBinding): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};
