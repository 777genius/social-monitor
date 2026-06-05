import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type FailedScanCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly attemptNumber: number;
  readonly retryBudget: number;
  readonly failureReason: string;
};

export type RetryScanCommand = FailedScanCommand & {
  readonly nextAttemptNumber: number;
};

export interface ScanFailureQueuePort {
  enqueueRetry(command: RetryScanCommand): Promise<void>;
  deadLetter(command: FailedScanCommand): Promise<void>;
}
