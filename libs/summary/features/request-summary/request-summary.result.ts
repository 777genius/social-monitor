import type { SummaryJobStatus } from '../../domain';

export type RequestSummaryResult = {
  readonly summaryJobId: string;
  readonly status: SummaryJobStatus;
  readonly created: boolean;
};
