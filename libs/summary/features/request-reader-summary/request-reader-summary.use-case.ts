import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryScope,
  ReaderSummaryJob,
  readerSummaryScopeKey,
  type ReaderSummaryJobProps,
} from "../../domain";
import type {
  ReaderSummaryJobQueuePort,
  ReaderSummaryJobRepositoryPort,
  SummaryQuotaPort,
} from "../../ports";
import type { RequestReaderSummaryCommand } from "./request-reader-summary.command";
import type { RequestReaderSummaryResult } from "./request-reader-summary.result";

type RequestReaderSummaryFailure = DomainError | Error;

export class RequestReaderSummaryUseCase {
  constructor(
    private readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort,
    private readonly readerSummaryJobQueue: ReaderSummaryJobQueuePort,
    private readonly summaryQuota: SummaryQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RequestReaderSummaryCommand,
  ): Promise<Result<RequestReaderSummaryResult, RequestReaderSummaryFailure>> {
    const userId = normalizeOptionalText(command.userId);
    const subscriptionId = normalizeOptionalText(command.subscriptionId);
    const idempotencyKey = command.idempotencyKey.trim();

    try {
      assertReaderSummaryScope(command.scope);
    } catch (error) {
      return err(new DomainError("validation.failed", safeErrorMessage(error)));
    }

    if (idempotencyKey.length === 0) {
      return err(
        new DomainError(
          "validation.failed",
          "Reader summary idempotency key must be non-empty",
        ),
      );
    }

    if (subscriptionId !== undefined && userId === undefined) {
      return err(
        new DomainError(
          "validation.failed",
          "Subscription-scoped reader summary request must include userId",
        ),
      );
    }

    const existing = await this.readerSummaryJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey,
    });

    if (existing !== null) {
      const snapshot = existing.toSnapshot();

      if (
        !isSameIdempotentReaderSummaryRequest(snapshot, {
          scopeKey: readerSummaryScopeKey(command.scope),
          userId,
          subscriptionId,
        })
      ) {
        return err(
          new DomainError(
            "operation.conflict",
            "Reader summary idempotency key was already used for a different request scope",
            { idempotencyKey },
          ),
        );
      }

      return ok({
        readerSummaryJobId: snapshot.id,
        status: snapshot.status,
        created: false,
      });
    }

    const readerSummaryJobId = this.ids.generate();
    const queueCommand = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      readerSummaryJobId,
      correlationId: command.correlationId,
      causationId: idempotencyKey,
    };
    if (!(await this.readerSummaryJobQueue.canAccept(queueCommand))) {
      return err(
        new DomainError(
          "operation.backpressure",
          "Reader summary job queue backpressure limit reached",
        ),
      );
    }

    const quota = await this.summaryQuota.reserveSummaryJob({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scopeKey: readerSummaryScopeKey(command.scope),
      operation: "reader_summary.request",
    });
    if (!quota.ok) {
      return err(quota.error);
    }

    const job = ReaderSummaryJob.request({
      id: readerSummaryJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: command.scope,
      userId,
      subscriptionId,
      idempotencyKey,
      requestedAt: this.clock.now(),
    });
    await this.readerSummaryJobs.save(job);
    await this.readerSummaryJobQueue.enqueue(queueCommand);
    const snapshot = job.toSnapshot();

    return ok({
      readerSummaryJobId: snapshot.id,
      status: snapshot.status,
      created: true,
    });
  }
}

const normalizeOptionalText = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const isSameIdempotentReaderSummaryRequest = (
  snapshot: ReaderSummaryJobProps,
  request: {
    readonly scopeKey: string;
    readonly userId?: string;
    readonly subscriptionId?: string;
  },
): boolean =>
  readerSummaryScopeKey(snapshot.scope) === request.scopeKey &&
  snapshot.userId === request.userId &&
  snapshot.subscriptionId === request.subscriptionId;

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Invalid reader summary scope";
