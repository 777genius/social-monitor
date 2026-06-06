import type { ScanJobStatus } from '../../domain';

export type RequestScanResult = {
  readonly scanJobId: string;
  readonly status: ScanJobStatus;
  readonly created: boolean;
};
