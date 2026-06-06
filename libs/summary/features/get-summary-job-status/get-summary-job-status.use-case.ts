import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SummaryJobProps, SummaryJobStatus } from '../../domain';
import type { SummaryJobRepositoryPort } from '../../ports';
import type { GetSummaryJobStatusQuery } from './get-summary-job-status.query';
import type { GetSummaryJobStatusResult, SummaryJobTimelineEvent } from './get-summary-job-status.result';

type GetSummaryJobStatusFailure = DomainError;

export class GetSummaryJobStatusUseCase {
  constructor(private readonly summaryJobs: SummaryJobRepositoryPort) {}

  async execute(
    query: GetSummaryJobStatusQuery,
  ): Promise<Result<GetSummaryJobStatusResult, GetSummaryJobStatusFailure>> {
    if (query.summaryJobId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary job id must be non-empty'));
    }

    const job = await this.summaryJobs.findById(query);

    if (job === null) {
      return err(new DomainError('resource.not_found', 'Summary job not found', {
        summaryJobId: query.summaryJobId,
      }));
    }

    const snapshot = job.toSnapshot();

    return ok({
      summaryJobId: snapshot.id,
      topicId: snapshot.topicId,
      status: snapshot.status,
      requestedAt: snapshot.requestedAt.toISOString(),
      startedAt: snapshot.startedAt?.toISOString(),
      completedAt: snapshot.completedAt?.toISOString(),
      failedAt: snapshot.failedAt?.toISOString(),
      summaryId: snapshot.summaryId,
      failureReason: snapshot.failureReason,
      timeline: buildTimeline(snapshot),
    });
  }
}

const buildTimeline = (snapshot: SummaryJobProps): readonly SummaryJobTimelineEvent[] => {
  const events: SummaryJobTimelineEvent[] = [
    {
      status: 'requested',
      occurredAt: snapshot.requestedAt.toISOString(),
      message: 'Summary requested',
    },
  ];

  pushIfPresent(events, 'running', snapshot.startedAt, 'Summary generation started');
  pushIfPresent(events, snapshot.status, snapshot.completedAt, messageForCompletedStatus(snapshot.status));
  pushIfPresent(events, 'failed', snapshot.failedAt, snapshot.failureReason ?? 'Summary generation failed');

  return events;
};

const pushIfPresent = (
  events: SummaryJobTimelineEvent[],
  status: SummaryJobStatus,
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

const messageForCompletedStatus = (status: SummaryJobStatus): string =>
  status === 'no_signal' ? 'Summary completed with no reliable signal' : 'Summary completed';
