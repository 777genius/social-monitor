import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { BriefingJobProps, BriefingJobStatus } from '../../domain';
import type { BriefingJobRepositoryPort } from '../../ports';
import type { GetBriefingJobStatusQuery } from './get-briefing-job-status.query';
import type { BriefingJobTimelineEvent, GetBriefingJobStatusResult } from './get-briefing-job-status.result';

type GetBriefingJobStatusFailure = DomainError;

export class GetBriefingJobStatusUseCase {
  constructor(private readonly briefingJobs: BriefingJobRepositoryPort) {}

  async execute(
    query: GetBriefingJobStatusQuery,
  ): Promise<Result<GetBriefingJobStatusResult, GetBriefingJobStatusFailure>> {
    if (query.briefingJobId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Briefing job id must be non-empty'));
    }

    const job = await this.briefingJobs.findById(query);

    if (job === null) {
      return err(new DomainError('resource.not_found', 'Briefing job not found', {
        briefingJobId: query.briefingJobId,
      }));
    }

    const snapshot = job.toSnapshot();

    return ok({
      briefingJobId: snapshot.id,
      scope: snapshot.scope,
      status: snapshot.status,
      requestedAt: snapshot.requestedAt.toISOString(),
      startedAt: snapshot.startedAt?.toISOString(),
      completedAt: snapshot.completedAt?.toISOString(),
      failedAt: snapshot.failedAt?.toISOString(),
      briefingId: snapshot.briefingId,
      failureReason: snapshot.failureReason,
      timeline: buildTimeline(snapshot),
    });
  }
}

const buildTimeline = (snapshot: BriefingJobProps): readonly BriefingJobTimelineEvent[] => {
  const events: BriefingJobTimelineEvent[] = [
    {
      status: 'requested',
      occurredAt: snapshot.requestedAt.toISOString(),
      message: 'Briefing requested',
    },
  ];

  pushIfPresent(events, 'running', snapshot.startedAt, 'Briefing generation started');
  pushIfPresent(events, snapshot.status, snapshot.completedAt, messageForCompletedStatus(snapshot.status));
  pushIfPresent(events, 'failed', snapshot.failedAt, snapshot.failureReason ?? 'Briefing generation failed');

  return events;
};

const pushIfPresent = (
  events: BriefingJobTimelineEvent[],
  status: BriefingJobStatus,
  occurredAt: Date | undefined,
  message: string,
): void => {
  if (occurredAt !== undefined) {
    events.push({
      status,
      occurredAt: occurredAt.toISOString(),
      message,
    });
  }
};

const messageForCompletedStatus = (status: BriefingJobStatus): string =>
  status === 'no_signal' ? 'Briefing completed with no reliable signal' : 'Briefing completed';
