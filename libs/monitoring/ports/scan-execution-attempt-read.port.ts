import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanExecutionAttemptStatus = 'running' | 'succeeded' | 'failed';

export type ScanExecutionAttemptSnapshot = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly status: ScanExecutionAttemptStatus;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly failureReason?: string;
};

export type FindScanExecutionAttemptQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
};

export interface ScanExecutionAttemptReadPort {
  findLatestByScanJob(query: FindScanExecutionAttemptQuery): Promise<ScanExecutionAttemptSnapshot | null>;
}
