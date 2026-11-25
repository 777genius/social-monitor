import type { SummaryJobStatus } from '../../domain';

export type RegenerateSummaryResult = {
  readonly summaryJobId: string;
  readonly status: SummaryJobStatus;
  readonly created: boolean;
};
