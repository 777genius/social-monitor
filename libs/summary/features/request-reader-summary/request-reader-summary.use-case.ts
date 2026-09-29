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
  resolveReaderSummaryPeriod,
  type ReaderSummaryJobProps,
  type ReaderSummarySelectionStrategy,
} from "../../domain";
import type {
  ReaderSummaryJobQueuePort,
  ReaderSummaryJobRepositoryPort,
  SummaryQuotaPort,
} from "../../ports";
import type { RequestReaderSummaryCommand } from "./request-reader-summary.command";
import type { RequestReaderSummaryResult } from "./request-reader-summary.result";

type RequestReaderSummaryFailure = DomainError | Error;

export interface ReaderSummarySelectionStrategyResolver {
  resolve(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId?: string;
  }): ReaderSummarySelectionStrategy;
}

const legacyReaderSummarySelectionStrategy: ReaderSummarySelectionStrategyResolver = {
  resolve: () => "legacy_v2",
};

const v3SuccessorPrefix = "v3-successor:";

export class RequestReaderSummaryUseCase {
  constructor(
    private readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort,
    private readonly readerSummaryJobQueue: ReaderSummaryJobQueuePort,
    private readonly summaryQuota: SummaryQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly selectionStrategy: ReaderSummarySelectionStrategyResolver =
      legacyReaderSummarySelectionStrategy,
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

    const period = (() => {
      try {
        return resolveReaderSummaryPeriod({
          cadence: command.cadence,
          period: command.period,
          timezone: command.timezone,
          now: this.clock.now(),
        });
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    })();
    if (period instanceof Error) {
      return err(new DomainError("validation.failed", period.message));
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
          periodKey: period.periodKey,
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

      if (idempotencyKey.startsWith(v3SuccessorPrefix) &&
          snapshot.selectionStrategy !== "jev_primary_v3") {
        return err(new DomainError(
          "operation.conflict",
          "V3 successor key already belongs to a non-V3 reader summary job",
        ));
      }

      return ok({
        readerSummaryJobId: snapshot.id,
        period: periodToResult(snapshot.period),
        status: snapshot.status,
        created: false,
      });
    }

    let successorStrategy: ReaderSummarySelectionStrategy | undefined;
    const successorSourceKey = idempotencyKey.startsWith(v3SuccessorPrefix)
      ? idempotencyKey.slice(v3SuccessorPrefix.length)
      : undefined;
    if (successorSourceKey !== undefined) {
      if (successorSourceKey.length === 0 || command.scope.type !== "workspace" ||
          (period.cadence !== "daily" && period.cadence !== "weekly")) {
        return err(new DomainError(
          "validation.failed",
          "V3 successor requests require a daily or weekly workspace period and source key",
        ));
      }
      const source = await this.readerSummaryJobs.findByIdempotencyKey({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        idempotencyKey: successorSourceKey,
      });
      if (source === null) {
        return err(new DomainError(
          "resource.not_found",
          "Legacy reader summary job for V3 successor was not found",
        ));
      }
      const snapshot = source.toSnapshot();
      if (!isSameIdempotentReaderSummaryRequest(snapshot, {
        scopeKey: readerSummaryScopeKey(command.scope),
        periodKey: period.periodKey,
        userId,
        subscriptionId,
      }) || (snapshot.status !== "completed" && snapshot.status !== "no_signal")) {
        return err(new DomainError(
          "operation.conflict",
          "V3 successor requires a published reader summary for the same scope and period",
        ));
      }
      if (snapshot.selectionStrategy === "jev_primary_v3") {
        return ok({
          readerSummaryJobId: snapshot.id,
          period: periodToResult(snapshot.period),
          status: snapshot.status,
          created: false,
        });
      }
      if (snapshot.selectionStrategy !== undefined &&
          snapshot.selectionStrategy !== "legacy_v2") {
        return err(new DomainError(
          "operation.conflict",
          "V3 successor source must be a legacy reader summary job",
        ));
      }
      successorStrategy = this.selectionStrategy.resolve({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
      });
      if (successorStrategy !== "jev_primary_v3") {
        // Keep the published legacy period usable while V3 selection is rolled back.
        return ok({
          readerSummaryJobId: snapshot.id,
          period: periodToResult(snapshot.period),
          status: snapshot.status,
          created: false,
        });
      }
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
      period,
      userId,
      subscriptionId,
      idempotencyKey,
      requestedAt: this.clock.now(),
      selectionStrategy: successorStrategy ?? this.selectionStrategy.resolve({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.scope.type === "interest"
          ? command.scope.interestId
          : undefined,
      }),
    });
    await this.readerSummaryJobs.save(job);
    await this.readerSummaryJobQueue.enqueue(queueCommand);
    const snapshot = job.toSnapshot();

    return ok({
      readerSummaryJobId: snapshot.id,
      period: periodToResult(snapshot.period),
      status: snapshot.status,
      created: true,
    });
  }
}

const periodToResult = (period: ReaderSummaryJobProps["period"]) => ({
  cadence: period.cadence,
  startedAt: period.startedAt.toISOString(),
  endedAt: period.endedAt.toISOString(),
  timezone: period.timezone,
  periodKey: period.periodKey,
});

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
    readonly periodKey: string;
    readonly userId?: string;
    readonly subscriptionId?: string;
  },
): boolean =>
  readerSummaryScopeKey(snapshot.scope) === request.scopeKey &&
  snapshot.period.periodKey === request.periodKey &&
  snapshot.userId === request.userId &&
  snapshot.subscriptionId === request.subscriptionId;

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Invalid reader summary scope";
