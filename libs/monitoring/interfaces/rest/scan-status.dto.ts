import type { ScanJobStatus } from '../../domain';

export type ScanStatusResponseDto = {
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly requestedAt: string;
  readonly enqueuedAt?: string;
};
