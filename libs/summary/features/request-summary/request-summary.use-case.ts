import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SummaryJob, type SummaryJobProps } from '../../domain';
import type { SummaryJobQueuePort, SummaryJobRepositoryPort, SummaryQuotaPort } from '../../ports';
import type { RequestSummaryCommand } from './request-summary.command';
import type { RequestSummaryResult } from './request-summary.result';

type RequestSummaryFailure = DomainError | Error;

export class RequestSummaryUseCase {
  constructor(
    private readonly summaryJobs: SummaryJobRepositoryPort,
    private readonly summaryJobQueue: SummaryJobQueuePort,
    private readonly summaryQuota: SummaryQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: RequestSummaryCommand): Promise<Result<RequestSummaryResult, RequestSummaryFailure>> {
    const interestId = command.interestId.trim();
    const userId = normalizeOptionalText(command.userId);
    const subscriptionId = normalizeOptionalText(command.subscriptionId);
    const idempotencyKey = command.idempotencyKey.trim();

    if (interestId.length === 0) {
      return err(new DomainError('validation.failed', 'Summary interest id must be non-empty'));
    }

    if (idempotencyKey.length === 0) {
      return err(new DomainError('validation.failed', 'Summary idempotency key must be non-empty'));
    }

    if (subscriptionId !== undefined && userId === undefined) {
      return err(new DomainError('validation.failed', 'Subscription-scoped summary request must include userId'));
    }

    const existing = await this.summaryJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey,
    });

    if (existing !== null) {
      const snapshot = existing.toSnapshot();

      if (!isSameIdempotentSummaryRequest(snapshot, { interestId, userId, subscriptionId })) {
        return err(new DomainError(
          'operation.conflict',
          'Summary idempotency key was already used for a different request scope',
          { idempotencyKey },
        ));
      }

      return ok({
        summaryJobId: snapshot.id,
        status: snapshot.status,
        created: false,
      });
    }

    const summaryJobId = this.ids.generate();
    const queueCommand = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      summaryJobId,
      correlationId: command.correlationId,
      causationId: idempotencyKey,
    };
    if (!(await this.summaryJobQueue.canAccept(queueCommand))) {
      return err(new DomainError('operation.backpressure', 'Summary job queue backpressure limit reached', {
        interestId,
      }));
    }

    const quota = await this.summaryQuota.reserveSummaryJob({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId,
      operation: 'summary.request',
    });
    if (!quota.ok) {
      return err(quota.error);
    }

    const job = SummaryJob.request({
      id: summaryJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId,
      userId,
      subscriptionId,
      idempotencyKey,
      requestedAt: this.clock.now(),
    });
    await this.summaryJobs.save(job);
    await this.summaryJobQueue.enqueue(queueCommand);
    const snapshot = job.toSnapshot();

    return ok({
      summaryJobId: snapshot.id,
      status: snapshot.status,
      created: true,
    });
  }
}

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

const isSameIdempotentSummaryRequest = (
  snapshot: SummaryJobProps,
  request: {
    readonly interestId: string;
    readonly userId?: string;
    readonly subscriptionId?: string;
  },
): boolean =>
  snapshot.interestId === request.interestId &&
  snapshot.userId === request.userId &&
  snapshot.subscriptionId === request.subscriptionId;
