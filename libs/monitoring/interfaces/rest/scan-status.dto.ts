import type { ScanJobStatus } from '../../domain';
import type { ScanStatusFailureClass, ScanStatusUserState } from './scan-status-view';

export type ScanStatusResponseDto = {
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly userState: ScanStatusUserState;
  readonly failureClass?: ScanStatusFailureClass;
  readonly operatorAction: string;
  readonly requestedAt: string;
  readonly enqueuedAt?: string;
  readonly completedAt?: string;
  readonly failureReason?: string;
};
