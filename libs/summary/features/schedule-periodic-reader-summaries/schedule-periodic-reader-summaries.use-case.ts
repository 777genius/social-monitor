import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  DEFAULT_READER_SUMMARY_TIMEZONE,
  ReaderSummaryScheduleWindowPolicy,
  completedReaderSummaryPeriodForCadence,
  readerSummaryScopeKey,
  type ReaderSummaryPeriod,
  type ReaderSummaryPolicy,
  type ScheduledReaderSummaryCadence,
} from "../../domain";
import { readerSummaryTransientRecoveryKey } from "../../domain/policies/reader-summary-transient-recovery";
import type { ReaderSummaryJobRepositoryPort, ReaderSummaryPolicyRepositoryPort } from "../../ports";
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
    private readonly requestReaderSummary: Pick<
      RequestReaderSummaryUseCase,
      "execute"
    >,
    private readonly jobs?: Pick<ReaderSummaryJobRepositoryPort, "findByIdempotencyKey">,
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

    if (
      (command.tenantId === undefined) !==
      (command.workspaceId === undefined)
    ) {
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
    const scheduleWindow = new ReaderSummaryScheduleWindowPolicy(
      command.readyAtUtc,
    );
    let evaluated = 0;
    let scheduled = 0;
    let existing = 0;
    let notReady = 0;

    for (const policy of policies) {
      for (const cadence of policy.toScheduleSettings().cadences) {
        const recoveryTimes = cadence === "daily" && scheduleWindow.canSchedule({ cadence, now: command.now })
          ? await this.recoveryTimes(policy, command.now) : [];
        for (const periodNow of [...recoveryTimes, command.now]) {
          if (evaluated >= command.limit) {
            break;
          }

          evaluated += 1;
          if (
            !scheduleWindow.canSchedule({
              cadence,
              now: command.now,
            })
          ) {
            notReady += 1;
            continue;
          }

          const item = await this.scheduleOne({
            policy,
            cadence,
            now: periodNow,
            correlationId: command.correlationId,
          });

          // Discovery uses durable state; the current selector can disable V3
          // before dispatch. An unchanged old failure must not consume today's slot.
          if (periodNow.getTime() !== command.now.getTime() && item.ok && !item.value.created &&
              item.value.status === "failed") {
            evaluated -= 1;
            continue;
          }

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
      }

      if (evaluated >= command.limit) {
        break;
      }
    }

    return ok({
      evaluated,
      scheduled,
      existing,
      notReady,
      failed: failures.length,
      summaries,
      failures,
    });
  }

  /** Revisit only existing failed daily periods; never backfill missing days.
   * A requested/completed replacement does not consume the next tick's limit.
   */
  private async recoveryTimes(policy: ReaderSummaryPolicy, now: Date): Promise<readonly Date[]> {
    if (this.jobs === undefined) return [];
    const snapshot = policy.toSnapshot();
    const result: Date[] = [];
    for (const days of [1, 2]) {
      const periodNow = new Date(now.getTime() - days * 86_400_000);
      const period = completedReaderSummaryPeriodForCadence({ cadence: "daily", now: periodNow,
        timezone: DEFAULT_READER_SUMMARY_TIMEZONE });
      let key = readerSummaryScheduleIdempotencyKey({ ...snapshot,
        scopeKey: readerSummaryScopeKey(snapshot.scope), cadence: "daily", period,
        policyVersion: snapshot.updatedAt.toISOString() });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const job = await this.jobs.findByIdempotencyKey({ tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId, idempotencyKey: key });
        if (job === null) {
          if (attempt > 0) result.push(periodNow);
          break;
        }
        const next = readerSummaryTransientRecoveryKey(job.toSnapshot(), now);
        if (next === undefined) break;
        key = next;
      }
    }
    return result;
  }

  private async scheduleOne(params: {
    readonly policy: ReaderSummaryPolicy;
    readonly cadence: ScheduledReaderSummaryCadence;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<
    | {
        readonly ok: true;
        readonly value: ScheduledPeriodicReaderSummaryResultItem;
      }
    | {
        readonly ok: false;
        readonly failure: SchedulePeriodicReaderSummariesResult["failures"][number];
      }
  > {
    const snapshot = params.policy.toSnapshot();
    const scopeKey = readerSummaryScopeKey(snapshot.scope);
    const timezone = DEFAULT_READER_SUMMARY_TIMEZONE;

    try {
      const period = completedReaderSummaryPeriodForCadence({
        cadence: params.cadence,
        now: params.now,
        timezone,
      });
      const idempotencyKey = readerSummaryScheduleIdempotencyKey({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        scopeKey,
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
        recoverTransientFailure: true,
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
  readonly cadence: ScheduledReaderSummaryCadence;
  readonly period: ReaderSummaryPeriod;
  readonly policyVersion: string;
}): string =>
  [
    "reader-summary",
    params.tenantId,
    params.workspaceId,
    params.scopeKey,
    params.cadence,
    params.period.periodKey,
    "shared",
    params.policyVersion,
  ].join(":");

const periodToResult = (period: ReaderSummaryPeriod) => ({
  startedAt: period.startedAt.toISOString(),
  endedAt: period.endedAt.toISOString(),
  timezone: period.timezone,
  periodKey: period.periodKey,
});
