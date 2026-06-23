import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { assertBriefingScope, BriefingJob, briefingScopeKey, type BriefingJobProps } from '../../domain';
import type { BriefingJobQueuePort, BriefingJobRepositoryPort, SummaryQuotaPort } from '../../ports';
import type { RequestBriefingCommand } from './request-briefing.command';
import type { RequestBriefingResult } from './request-briefing.result';

type RequestBriefingFailure = DomainError | Error;

export class RequestBriefingUseCase {
  constructor(
    private readonly briefingJobs: BriefingJobRepositoryPort,
    private readonly briefingJobQueue: BriefingJobQueuePort,
    private readonly summaryQuota: SummaryQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: RequestBriefingCommand): Promise<Result<RequestBriefingResult, RequestBriefingFailure>> {
    const userId = normalizeOptionalText(command.userId);
    const subscriptionId = normalizeOptionalText(command.subscriptionId);
    const idempotencyKey = command.idempotencyKey.trim();

    try {
      assertBriefingScope(command.scope);
    } catch (error) {
      return err(new DomainError('validation.failed', safeErrorMessage(error)));
    }

    if (idempotencyKey.length === 0) {
      return err(new DomainError('validation.failed', 'Briefing idempotency key must be non-empty'));
    }

    if (subscriptionId !== undefined && userId === undefined) {
      return err(new DomainError('validation.failed', 'Subscription-scoped briefing request must include userId'));
    }

    const existing = await this.briefingJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey,
    });

    if (existing !== null) {
      const snapshot = existing.toSnapshot();

      if (!isSameIdempotentBriefingRequest(snapshot, {
        scopeKey: briefingScopeKey(command.scope),
        userId,
        subscriptionId,
      })) {
        return err(new DomainError(
          'operation.conflict',
          'Briefing idempotency key was already used for a different request scope',
          { idempotencyKey },
        ));
      }

      return ok({
        briefingJobId: snapshot.id,
        status: snapshot.status,
        created: false,
      });
    }

    const briefingJobId = this.ids.generate();
    const queueCommand = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      briefingJobId,
      correlationId: command.correlationId,
      causationId: idempotencyKey,
    };
    if (!(await this.briefingJobQueue.canAccept(queueCommand))) {
      return err(new DomainError('operation.backpressure', 'Briefing job queue backpressure limit reached'));
    }

    const quota = await this.summaryQuota.reserveSummaryJob({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scopeKey: briefingScopeKey(command.scope),
      operation: 'briefing.request',
    });
    if (!quota.ok) {
      return err(quota.error);
    }

    const job = BriefingJob.request({
      id: briefingJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: command.scope,
      userId,
      subscriptionId,
      idempotencyKey,
      requestedAt: this.clock.now(),
    });
    await this.briefingJobs.save(job);
    await this.briefingJobQueue.enqueue(queueCommand);
    const snapshot = job.toSnapshot();

    return ok({
      briefingJobId: snapshot.id,
      status: snapshot.status,
      created: true,
    });
  }
}

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

const isSameIdempotentBriefingRequest = (
  snapshot: BriefingJobProps,
  request: {
    readonly scopeKey: string;
    readonly userId?: string;
    readonly subscriptionId?: string;
  },
): boolean =>
  briefingScopeKey(snapshot.scope) === request.scopeKey &&
  snapshot.userId === request.userId &&
  snapshot.subscriptionId === request.subscriptionId;

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Invalid briefing scope';
