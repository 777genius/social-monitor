import type { SummaryJobStatus } from '../../domain';

export type ExecuteSummaryJobResult = {
  readonly summaryJobId: string;
  readonly status: SummaryJobStatus;
  readonly summaryId?: string;
};
