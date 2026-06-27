import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  completedReaderSummaryPeriodForCadence,
  readerSummaryScopeKey,
  type ReaderSummaryPeriod,
  type ReaderSummaryPolicy,
  type ScheduledReaderSummaryCadence,
} from "../../domain";
import type { ReaderSummaryPolicyRepositoryPort } from "../../ports";
import type { RequestReaderSummaryUseCase } from "../request-reader-summary/request-reader-summary.use-case";
import type { SchedulePeriodicReaderSummariesCommand } from "./schedule-periodic-reader-summaries.command";
import type {
  ScheduledPeriodicReaderSummaryResultItem,
  SchedulePeriodicReaderSummariesResult,
} from "./schedule-periodic-reader-summaries.result";

type SchedulePeriodicReaderSummariesFailure = DomainError | Error;

const MAX_LIMIT = 100;

export class SchedulePeriodicReaderSummariesUseCase {
  constructor(
    private readonly readerSummaryPolicies: ReaderSummaryPolicyRepositoryPort,
    private readonly requestReaderSummary: RequestReaderSummaryUseCase,
  ) {}

  async execute(
    command: SchedulePeriodicReaderSummariesCommand,
  ): Promise<
    Result<
      SchedulePeriodicReaderSummariesResult,
      SchedulePeriodicReaderSummariesFailure
    >
  > {
    if (
      !Number.isInteger(command.limit) ||
      command.limit < 1 ||
      command.limit > MAX_LIMIT
    ) {
      return err(
        new DomainError(
          "validation.failed",
          "Periodic reader summary schedule limit must be between 1 and 100",
        ),
      );
    }

    if ((command.tenantId === undefined) !== (command.workspaceId === undefined)) {
      return err(
        new DomainError(
          "validation.failed",
          "Periodic reader summary tenantId and workspaceId filters must be set together",
        ),
      );
    }

    const policies = await this.readerSummaryPolicies.listScheduled({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      limit: command.limit,
    });
    const summaries: ScheduledPeriodicReaderSummaryResultItem[] = [];
    const failures: {
      readonly scopeKey: string;
      readonly cadence: ScheduledReaderSummaryCadence;
      readonly message: string;
    }[] = [];
    let evaluated = 0;
    let scheduled = 0;
    let existing = 0;

    for (const policy of policies) {
      for (const cadence of policy.toScheduleSettings().cadences) {
        if (evaluated >= command.limit) {
          break;
        }

        evaluated += 1;
        const item = await this.scheduleOne({
          policy,
          cadence,
          now: command.now,
          correlationId: command.correlationId,
        });

        if (item.ok) {
          summaries.push(item.value);
          if (item.value.created) {
            scheduled += 1;
          } else {
            existing += 1;
          }
          continue;
        }

        failures.push(item.failure);
      }

      if (evaluated >= command.limit) {
        break;
      }
    }

    return ok({
      evaluated,
      scheduled,
      existing,
      failed: failures.length,
      summaries,
      failures,
    });
  }

  private async scheduleOne(params: {
    readonly policy: ReaderSummaryPolicy;
    readonly cadence: ScheduledReaderSummaryCadence;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<
    | { readonly ok: true; readonly value: ScheduledPeriodicReaderSummaryResultItem }
    | {
        readonly ok: false;
        readonly failure: SchedulePeriodicReaderSummariesResult["failures"][number];
      }
  > {
    const snapshot = params.policy.toSnapshot();
    const schedule = params.policy.toScheduleSettings();
    const scopeKey = readerSummaryScopeKey(snapshot.scope);

    try {
      const period = completedReaderSummaryPeriodForCadence({
        cadence: params.cadence,
        now: params.now,
        timezone: schedule.timezone,
      });
      const idempotencyKey = readerSummaryScheduleIdempotencyKey({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        scopeKey,
        targetKey: readerSummaryScheduleTargetKey(snapshot),
        cadence: params.cadence,
        period,
        policyVersion: snapshot.updatedAt.toISOString(),
      });
      const result = await this.requestReaderSummary.execute({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        scope: snapshot.scope,
        cadence: params.cadence,
        period: {
          startedAt: period.startedAt,
          endedAt: period.endedAt,
          timezone: period.timezone,
        },
        idempotencyKey,
        correlationId: `${params.correlationId}:${params.cadence}:${period.periodKey}`,
      });

      if (!result.ok) {
        return {
          ok: false,
          failure: {
            scopeKey,
            cadence: params.cadence,
            message: result.error.message,
          },
        };
      }

      return {
        ok: true,
        value: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          scope: snapshot.scope,
          cadence: params.cadence,
          period: periodToResult(period),
          readerSummaryJobId: result.value.readerSummaryJobId,
          status: result.value.status,
          created: result.value.created,
          idempotencyKey,
        },
      };
    } catch (error) {
      return {
        ok: false,
        failure: {
          scopeKey,
          cadence: params.cadence,
          message:
            error instanceof Error
              ? error.message
              : "Periodic reader summary scheduling failed",
        },
      };
    }
  }
}

const readerSummaryScheduleIdempotencyKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeKey: string;
  readonly targetKey: string;
  readonly cadence: ScheduledReaderSummaryCadence;
  readonly period: ReaderSummaryPeriod;
  readonly policyVersion: string;
}): string =>
  [
    "reader-summary",
    params.tenantId,
    params.workspaceId,
    params.scopeKey,
    params.targetKey,
    params.cadence,
    params.period.periodKey,
    params.policyVersion,
  ].join(":");

const readerSummaryScheduleTargetKey = (
  policy: ReturnType<ReaderSummaryPolicy["toSnapshot"]>,
): string => `policy.${policy.id}`;

const periodToResult = (period: ReaderSummaryPeriod) => ({
  startedAt: period.startedAt.toISOString(),
  endedAt: period.endedAt.toISOString(),
  timezone: period.timezone,
  periodKey: period.periodKey,
});
