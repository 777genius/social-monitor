import type { ScanJobStatus } from '../../domain';

export type RequestScanResponseDto = {
  readonly scanJobId: string;
  readonly status: ScanJobStatus;
  readonly created: boolean;
};
