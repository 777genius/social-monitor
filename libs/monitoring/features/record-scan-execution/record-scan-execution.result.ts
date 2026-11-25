import type { ScanJobStatus } from '../../domain';

export type RecordScanExecutionResult = {
  readonly scanJobId: string;
  readonly status: ScanJobStatus;
};
