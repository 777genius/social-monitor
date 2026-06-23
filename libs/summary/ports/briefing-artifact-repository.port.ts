import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingArtifact, BriefingScope } from '../domain';

export type ListBriefingArtifactsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope?: BriefingScope;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListBriefingArtifactsResult = {
  readonly items: readonly BriefingArtifact[];
  readonly nextCursor?: string;
};

export interface BriefingArtifactRepositoryPort {
  save(artifact: BriefingArtifact): Promise<void>;
  list(query: ListBriefingArtifactsQuery): Promise<ListBriefingArtifactsResult>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly briefingId: string;
  }): Promise<BriefingArtifact | null>;
}
