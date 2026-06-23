import type { BriefingJobStatus, BriefingScope } from '../../domain';

export type BriefingJobTimelineEvent = {
  readonly status: BriefingJobStatus;
  readonly occurredAt: string;
  readonly message: string;
};

export type GetBriefingJobStatusResult = {
  readonly briefingJobId: string;
  readonly scope: BriefingScope;
  readonly status: BriefingJobStatus;
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
  readonly briefingId?: string;
  readonly failureReason?: string;
  readonly timeline: readonly BriefingJobTimelineEvent[];
};
