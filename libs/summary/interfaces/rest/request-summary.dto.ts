import type { SummaryJobStatus } from '../../domain';

export type RequestSummaryResponseDto = {
  readonly summaryJobId: string;
  readonly status: SummaryJobStatus;
  readonly created: boolean;
};
