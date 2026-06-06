import type { ScanJobStatus } from '../../domain';

export type GetScanStatusResult = {
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly requestedAt: Date;
  readonly enqueuedAt?: Date;
  readonly completedAt?: Date;
  readonly failureReason?: string;
};
