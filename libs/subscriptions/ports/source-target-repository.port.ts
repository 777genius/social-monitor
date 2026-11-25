import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceTarget } from '../domain';

export type FindSourceTargetByNormalizedKeyQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly providerKey: string;
  readonly normalizedKey: string;
};

export interface SourceTargetRepositoryPort {
  save(target: SourceTarget): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceTargetId: string;
  }): Promise<SourceTarget | null>;
  findByNormalizedKey(query: FindSourceTargetByNormalizedKeyQuery): Promise<SourceTarget | null>;
}
