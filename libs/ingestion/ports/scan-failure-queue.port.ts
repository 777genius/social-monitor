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
  claimRetries(params: {
    readonly limit: number;
    readonly now: Date;
    readonly visibilityTimeoutSeconds: number;
  }): Promise<readonly ScanRetryDelivery[]>;
}

export type ScanRetryDelivery = {
  readonly command: RetryScanCommand;
  /** False means ownership expired or another consumer owns this entry. */
  renew(now: Date): Promise<boolean>;
  ack(): Promise<void>;
  nack(params: { readonly requeue: boolean }): Promise<void>;
};

export const assertValidScanRetryClaim = (params: {
  readonly limit: number;
  readonly now: Date;
  readonly visibilityTimeoutSeconds: number;
}): void => {
  if (!Number.isInteger(params.limit) || params.limit < 1) {
    throw new Error('Scan retry claim limit must be a positive integer');
  }
  if (!Number.isFinite(params.now.getTime())) {
    throw new Error('Scan retry claim time must be valid');
  }
  if (!Number.isInteger(params.visibilityTimeoutSeconds) || params.visibilityTimeoutSeconds < 1) {
    throw new Error('Scan retry visibility timeout must be a positive integer');
  }
};

export interface ScanFailureInspectionPort {
  listDeadLetters(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly limit: number;
  }): Promise<readonly FailedScanCommand[]>;
}
