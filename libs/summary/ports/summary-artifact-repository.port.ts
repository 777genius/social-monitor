import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryArtifact } from '../domain';

export interface SummaryArtifactRepositoryPort {
  save(artifact: SummaryArtifact): Promise<void>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    summaryId: string;
  }): Promise<SummaryArtifact | null>;
}
