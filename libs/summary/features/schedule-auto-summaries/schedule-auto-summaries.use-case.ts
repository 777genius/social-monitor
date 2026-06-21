import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { AutoSummaryCandidateRepositoryPort } from '../../ports';
import type { RequestSummaryUseCase } from '../request-summary/request-summary.use-case';
import type { ScheduleAutoSummariesCommand } from './schedule-auto-summaries.command';
import type { ScheduleAutoSummariesResult, ScheduledAutoSummaryResultItem } from './schedule-auto-summaries.result';

type ScheduleAutoSummariesFailure = DomainError | Error;

export class ScheduleAutoSummariesUseCase {
  constructor(
    private readonly candidates: AutoSummaryCandidateRepositoryPort,
    private readonly requestSummary: RequestSummaryUseCase,
  ) {}

  async execute(
    command: ScheduleAutoSummariesCommand,
  ): Promise<Result<ScheduleAutoSummariesResult, ScheduleAutoSummariesFailure>> {
    if (!Number.isInteger(command.limit) || command.limit < 1) {
      return err(new DomainError('validation.failed', 'Auto-summary limit must be a positive integer'));
    }

    if ((command.tenantId === undefined) !== (command.workspaceId === undefined)) {
      return err(new DomainError(
        'validation.failed',
        'Auto-summary tenantId and workspaceId must be set together',
      ));
    }

    const candidates = await this.candidates.findDueCandidates({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      latestFeedItemObservedBefore: command.latestFeedItemObservedBefore,
      limit: command.limit,
    });
    const summaries: ScheduledAutoSummaryResultItem[] = [];
    const failures: ScheduleAutoSummariesResult['failures'][number][] = [];

    for (const candidate of candidates) {
      const idempotencyKey = autoSummaryIdempotencyKey(candidate.topicId, {
        latestFeedItemObservedAt: candidate.latestFeedItemObservedAt,
        newFeedItemCount: candidate.newFeedItemCount,
      });
      const requested = await this.requestSummary.execute({
        tenantId: candidate.tenantId,
        workspaceId: candidate.workspaceId,
        topicId: candidate.topicId,
        idempotencyKey,
        correlationId: command.correlationId,
      });

      if (!requested.ok) {
        failures.push({
          topicId: candidate.topicId,
          message: requested.error instanceof Error ? requested.error.message : String(requested.error),
        });
        continue;
      }

      summaries.push({
        tenantId: candidate.tenantId,
        workspaceId: candidate.workspaceId,
        topicId: candidate.topicId,
        summaryJobId: requested.value.summaryJobId,
        status: requested.value.status,
        created: requested.value.created,
        idempotencyKey,
        latestFeedItemObservedAt: candidate.latestFeedItemObservedAt.toISOString(),
        newFeedItemCount: candidate.newFeedItemCount,
      });
    }

    return ok({
      evaluated: candidates.length,
      scheduled: summaries.filter((summary) => summary.created).length,
      existing: summaries.filter((summary) => !summary.created).length,
      failed: failures.length,
      summaries,
      failures,
    });
  }
}

export const autoSummaryIdempotencyKey = (
  topicId: string,
  params: {
    readonly latestFeedItemObservedAt: Date;
    readonly newFeedItemCount: number;
  },
): string =>
  [
    'auto-summary',
    topicId,
    params.latestFeedItemObservedAt.toISOString(),
    String(params.newFeedItemCount),
  ].join(':');
