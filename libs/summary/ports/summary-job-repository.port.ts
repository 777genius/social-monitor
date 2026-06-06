import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryJob } from '../domain';

export interface SummaryJobRepositoryPort {
  save(job: SummaryJob): Promise<void>;
  findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<SummaryJob | null>;
}
