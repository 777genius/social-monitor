import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceQuery } from './source-provider.port';

export type FailedScanCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
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

export interface ScanRetryQueuePort {
  drainRetries(params: {
    readonly limit: number;
  }): Promise<readonly RetryScanCommand[]>;
}

export interface ScanFailureInspectionPort {
  listDeadLetters(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly limit: number;
  }): Promise<readonly FailedScanCommand[]>;
}
