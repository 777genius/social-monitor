import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SummaryJob } from '../../domain';
import type { SummaryJobRepositoryPort, SummaryQuotaPort } from '../../ports';
import type { RequestSummaryCommand } from './request-summary.command';
import type { RequestSummaryResult } from './request-summary.result';

type RequestSummaryFailure = DomainError | Error;

export class RequestSummaryUseCase {
  constructor(
    private readonly summaryJobs: SummaryJobRepositoryPort,
    private readonly summaryQuota: SummaryQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: RequestSummaryCommand): Promise<Result<RequestSummaryResult, RequestSummaryFailure>> {
    if (command.topicId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary topic id must be non-empty'));
    }

    const existing = await this.summaryJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
    });

    if (existing !== null) {
      const snapshot = existing.toSnapshot();

      return ok({
        summaryJobId: snapshot.id,
        status: snapshot.status,
        created: false,
      });
    }

    const quota = await this.summaryQuota.reserveSummaryJob({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
      operation: 'summary.request',
    });
    if (!quota.ok) {
      return err(quota.error);
    }

    const job = SummaryJob.request({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
      idempotencyKey: command.idempotencyKey,
      requestedAt: this.clock.now(),
    });
    await this.summaryJobs.save(job);
    const snapshot = job.toSnapshot();

    return ok({
      summaryJobId: snapshot.id,
      status: snapshot.status,
      created: true,
    });
  }
}
