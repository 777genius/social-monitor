import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanAttempt } from '../domain';

export type FindScanAttemptQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
};

export interface ScanAttemptRepositoryPort {
  save(attempt: ScanAttempt): Promise<void>;
  findByScanJob(query: FindScanAttemptQuery): Promise<ScanAttempt | null>;
}
