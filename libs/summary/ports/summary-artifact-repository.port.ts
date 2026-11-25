import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryArtifact } from '../domain';

export type ListSummaryArtifactsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId?: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListSummaryArtifactsResult = {
  readonly items: readonly SummaryArtifact[];
  readonly nextCursor?: string;
};

export interface SummaryArtifactRepositoryPort {
  save(artifact: SummaryArtifact): Promise<void>;
  list(query: ListSummaryArtifactsQuery): Promise<ListSummaryArtifactsResult>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    summaryId: string;
  }): Promise<SummaryArtifact | null>;
}
