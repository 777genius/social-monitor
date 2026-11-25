import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RelevanceMemoryProjection } from '../domain';

export const RELEVANCE_MEMORY_PROJECTION_REPOSITORY = Symbol('RELEVANCE_MEMORY_PROJECTION_REPOSITORY');

export interface RelevanceMemoryProjectionRepositoryPort {
  save(projection: RelevanceMemoryProjection): Promise<void>;
  findDue(params: {
    readonly limit: number;
    readonly now: Date;
    readonly tenantId?: TenantId;
    readonly workspaceId?: WorkspaceId;
  }): Promise<readonly RelevanceMemoryProjection[]>;
}
