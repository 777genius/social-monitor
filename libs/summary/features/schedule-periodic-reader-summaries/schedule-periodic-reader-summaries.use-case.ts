import {
  DomainError,
  err,
  ok,
  redactSensitiveText,
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
import type {
  PeriodicReaderSummaryContinuation,
  SchedulePeriodicReaderSummariesCommand,
} from "./schedule-periodic-reader-summaries.command";
import type {
  ScheduledPeriodicReaderSummaryResultItem,
  SchedulePeriodicReaderSummariesResult,
} from "./schedule-periodic-reader-summaries.result";

type SchedulePeriodicReaderSummariesFailure = DomainError | Error;

const MAX_LIMIT = 100;
const CADENCES: readonly ScheduledReaderSummaryCadence[] = ["daily", "weekly", "monthly"];

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

    const day = command.now.toISOString().slice(0, 10);
    let continuation = command.continuation;
    if (continuation !== undefined) {
      if (continuation.tenantId !== command.tenantId ||
          continuation.workspaceId !== command.workspaceId) {
        continuation = undefined;
      } else if (continuation.day !== day) {
        // A sweep can span a day at scale. Keep the fair policy/cadence position,
        // but do not carry relative recovery progress into a different period.
        continuation = { ...continuation, day, periodDay: undefined };
      }
    }

    const readPage = (cursor: PeriodicReaderSummaryContinuation | undefined) =>
      this.readerSummaryPolicies.listScheduled({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        limit: command.limit,
        ...(cursor === undefined ? {} : {
          cursor: { policyId: cursor.policyId, inclusive: cursor.cadence !== undefined },
        }),
      });
    let policies = await readPage(continuation);
    if (policies.length === 0 && continuation !== undefined) {
      continuation = undefined;
      policies = await readPage(undefined);
    }
    const summaries: ScheduledPeriodicReaderSummaryResultItem[] = [];
    const failures: {
      readonly scopeKey: string;
      readonly cadence: ScheduledReaderSummaryCadence;
      readonly message: string;
    }[] = [];
    const scheduleWindow = new ReaderSummaryScheduleWindowPolicy(command.readyAtUtc);
    let evaluated = 0;
    let scheduled = 0;
    let existing = 0;
    let notReady = 0;
    let inspected = 0;

    const next = (
      policyId: string,
      cadence?: ScheduledReaderSummaryCadence,
      periodDay?: string,
    ): PeriodicReaderSummaryContinuation => ({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      day,
      policyId,
      cadence,
      periodDay,
    });
    const finish = (cursor?: PeriodicReaderSummaryContinuation) => ok({
      evaluated,
      scheduled,
      existing,
      notReady,
      failed: failures.length,
      summaries,
      failures,
      ...(cursor === undefined ? {} : { continuation: cursor }),
    });
    // Historical unchanged failures do not consume admission slots, but must
    // still consume a bounded amount of work per tick.
    const budgetReached = () => evaluated >= command.limit || inspected >= command.limit * 3;
    const periodDays = [1, 2, 0].map((days) =>
      new Date(command.now.getTime() - days * 86_400_000).toISOString().slice(0, 10));

    for (const policy of policies) {
      const snapshot = policy.toSnapshot();
      const resume = continuation?.policyId === snapshot.id ? continuation : undefined;
      const cadences = CADENCES.filter((cadence) =>
        snapshot.schedule.cadences.includes(cadence) &&
        (resume?.cadence === undefined || CADENCES.indexOf(cadence) >= CADENCES.indexOf(resume.cadence)));

      for (const cadence of cadences) {
        if (budgetReached()) return finish(next(snapshot.id, cadence));

        let recoveryTimes: readonly Date[];
        try {
          recoveryTimes = cadence === "daily" && scheduleWindow.canSchedule({ cadence, now: command.now })
            ? await this.recoveryTimes(policy, command.now) : [];
        } catch (error) {
          evaluated += 1;
          inspected += 1;
          failures.push({
            scopeKey: readerSummaryScopeKey(snapshot.scope),
            cadence,
            message: safeSchedulingFailure(error),
          });
          continue;
        }

        const firstPeriod = resume?.cadence === cadence && resume.periodDay !== undefined
          ? periodDays.indexOf(resume.periodDay) : 0;
        const periods = [...recoveryTimes, command.now].filter((periodNow) =>
          periodDays.indexOf(periodNow.toISOString().slice(0, 10)) >= firstPeriod);
        for (const periodNow of periods) {
          if (budgetReached()) {
            return finish(next(snapshot.id, cadence, periodNow.toISOString().slice(0, 10)));
          }

          inspected += 1;
          evaluated += 1;
          if (!scheduleWindow.canSchedule({ cadence, now: command.now })) {
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
            if (item.value.created) scheduled += 1;
            else existing += 1;
          } else {
            failures.push(item.failure);
          }
        }
      }
    }

    const lastPolicy = policies.at(-1);
    return finish(policies.length === command.limit && lastPolicy !== undefined
      ? next(lastPolicy.toSnapshot().id) : undefined);
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
            message: safeSchedulingFailure(result.error),
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
          message: safeSchedulingFailure(error),
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

const safeSchedulingFailure = (error: unknown): string =>
  redactSensitiveText(error instanceof Error ? error.message : "Periodic reader summary scheduling failed")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240);
