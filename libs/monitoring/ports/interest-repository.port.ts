import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Interest } from '../domain';

export type ListInterestsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListInterestsResult = {
  readonly interests: readonly Interest[];
  readonly nextCursor?: string;
};

export type ArchiveInterestParams = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly archivedAt: Date;
};

export interface InterestRepositoryPort {
  save(interest: Interest): Promise<void>;
  archive?(params: ArchiveInterestParams): Promise<void>;
  findByName(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Interest | null>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    interestId: string;
  }): Promise<Interest | null>;
  list(query: ListInterestsQuery): Promise<ListInterestsResult>;
}
