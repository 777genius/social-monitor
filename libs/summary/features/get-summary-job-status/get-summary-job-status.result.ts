import type { SummaryJobStatus } from '../../domain';

export type SummaryJobTimelineEvent = {
  readonly status: SummaryJobStatus;
  readonly occurredAt: string;
  readonly message: string;
};

export type GetSummaryJobStatusResult = {
  readonly summaryJobId: string;
  readonly topicId: string;
  readonly status: SummaryJobStatus;
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
  readonly summaryId?: string;
  readonly failureReason?: string;
  readonly timeline: readonly SummaryJobTimelineEvent[];
};
