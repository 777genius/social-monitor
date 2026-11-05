import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBinding } from '../../domain';
import type {
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  SourceBindingRepositoryPort,
  SourceBindingConfigIdentity,
} from '../../ports';
import { InMemoryInterestCreationState, monitoringSourceBindingIdKey,
  monitoringSourceBindingProviderKey } from './in-memory-interest-creation-state';
import { encodeOffsetCursor, parseOffsetCursor } from './offset-pagination';

export class InMemorySourceBindingRepository implements SourceBindingRepositoryPort {
  constructor(private readonly state = new InMemoryInterestCreationState()) {}

  private get bindingsByInterestProvider() { return this.state.sourceBindingsByInterestProvider; }
  private get bindingsById() { return this.state.sourceBindingsById; }

  async save(binding: SourceBinding): Promise<void> {
    this.state.saveSourceBinding(binding);
  }

  async findByInterestAndProvider(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    interestId: string;
    providerKey: string;
    configIdentity?: SourceBindingConfigIdentity;
  }): Promise<SourceBinding | null> {
    if (params.configIdentity !== undefined) {
      const { field, value } = params.configIdentity;
      return [...this.bindingsById.values()].find((binding) => {
        const snapshot = binding.toSnapshot();
        return snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.interestId === params.interestId &&
          snapshot.providerKey === params.providerKey &&
          snapshot.config[field] === value;
      }) ?? null;
    }
    return (
      this.bindingsByInterestProvider.get(monitoringSourceBindingProviderKey(params.tenantId, params.workspaceId, params.interestId, params.providerKey)) ??
      null
    );
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<SourceBinding | null> {
    return this.bindingsById.get(monitoringSourceBindingIdKey(params.tenantId, params.workspaceId, params.sourceBindingId)) ?? null;
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
