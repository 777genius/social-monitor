import {
  READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS,
  decideReaderSummaryWeeklyRetry,
  planReaderSummaryWeeklyCatchUp,
  type ReaderSummaryWeeklyFailureCategory,
  type ReaderSummaryWeeklyScheduleSlot,
  type ReaderSummaryWeeklySlotObservation,
} from "../../libs/summary/domain/policies/reader-summary-weekly-schedule-policy";

export type ReaderSummaryWeeklyScheduledFailure = Readonly<{
  category: ReaderSummaryWeeklyFailureCategory;
  retryable: boolean;
  code: string;
  cause: string;
}>;

export type ReaderSummaryWeeklyScheduledSlotOutcome =
  | Readonly<{ status: "completed" }>
  | Readonly<{
      status: "terminal";
      failure?: ReaderSummaryWeeklyScheduledFailure;
    }>;

export type ReaderSummaryWeeklySlotTerminalDiagnostic = Readonly<{
  slotIdentity: string;
  category: ReaderSummaryWeeklyFailureCategory;
  retryable: boolean;
  code: string;
  cause: string;
  finalRetryDecision:
    | "failure_is_terminal"
    | "infrastructure_not_retryable"
    | "attempt_limit_reached";
}>;

export type ReaderSummaryWeeklySchedulerResult = Readonly<{
  planned: number;
  completed: number;
  terminal: number;
  deferred: number;
  terminalDiagnostics: readonly ReaderSummaryWeeklySlotTerminalDiagnostic[];
}>;

export class ReaderSummaryWeeklyScheduledExecutionError extends Error {
  readonly failure: ReaderSummaryWeeklyScheduledFailure;
  readonly attemptNumber: number | undefined;

  constructor(
    message: string,
    failure: ReaderSummaryWeeklyScheduledFailure,
    attemptNumber?: number,
  ) {
    super(message);
    this.name = "ReaderSummaryWeeklyScheduledExecutionError";
    this.failure = safeFailure(failure);
    if (
      attemptNumber !== undefined &&
      (!Number.isInteger(attemptNumber) ||
        attemptNumber < 1 ||
        attemptNumber > READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS)
    ) throw new Error("Reader summary weekly scheduled attempt is invalid");
    this.attemptNumber = attemptNumber;
  }
}

export const runReaderSummaryWeeklyProductionSchedule = async (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly firstWeekStartedUtcDate: string;
  readonly now: Date;
  readonly catchUpLimit: number;
  readonly observedSlots: readonly ReaderSummaryWeeklySlotObservation[];
  readonly execute: (
    slot: ReaderSummaryWeeklyScheduleSlot,
    attemptNumber: number,
  ) => Promise<ReaderSummaryWeeklyScheduledSlotOutcome>;
  readonly wait: (milliseconds: number) => Promise<void>;
}): Promise<ReaderSummaryWeeklySchedulerResult> => {
  const plan = planReaderSummaryWeeklyCatchUp({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    firstWeekStartedUtcDate: params.firstWeekStartedUtcDate,
    now: params.now,
    catchUpLimit: params.catchUpLimit,
    observedSlots: params.observedSlots,
  });
  let completed = 0;
  let terminal = 0;
  const terminalDiagnostics: ReaderSummaryWeeklySlotTerminalDiagnostic[] = [];
  for (const slot of plan.slots) {
    let attemptNumber = 1;
    for (;;) {
      try {
        const outcome = await params.execute(slot, attemptNumber);
        if (outcome.status === "completed") {
          completed += 1;
        } else {
          terminal += 1;
          terminalDiagnostics.push(terminalDiagnostic(
            slot,
            outcome.failure ?? terminalOutcomeFailure,
            "failure_is_terminal",
          ));
        }
        break;
      } catch (error: unknown) {
        const failure = error instanceof ReaderSummaryWeeklyScheduledExecutionError
          ? error.failure
          : unknownFailure;
        const failedAttemptNumber =
          error instanceof ReaderSummaryWeeklyScheduledExecutionError &&
          error.attemptNumber !== undefined
            ? error.attemptNumber
            : attemptNumber;
        const decision = decideReaderSummaryWeeklyRetry({
          attemptNumber: failedAttemptNumber,
          failure: retryClassification(failure),
        });
        if (decision.decision === "terminal") {
          terminal += 1;
          terminalDiagnostics.push(
            terminalDiagnostic(slot, failure, decision.reason),
          );
          break;
        }
        await params.wait(decision.backoffMs);
        attemptNumber = decision.nextAttemptNumber;
      }
    }
  }
  return Object.freeze({
    planned: plan.slots.length,
    completed,
    terminal,
    deferred: plan.deferredSlotCount,
    terminalDiagnostics: Object.freeze(terminalDiagnostics),
  });
};

const terminalOutcomeFailure: ReaderSummaryWeeklyScheduledFailure = Object.freeze({
  category: "domain",
  retryable: false,
  code: "slot_execution_terminal",
  cause: "slot_execution",
});

const unknownFailure: ReaderSummaryWeeklyScheduledFailure = Object.freeze({
  category: "domain",
  retryable: false,
  code: "execution_error",
  cause: "unknown",
});

const retryClassification = (
  failure: ReaderSummaryWeeklyScheduledFailure,
) => Object.freeze({ category: failure.category, retryable: failure.retryable });

const terminalDiagnostic = (
  slot: ReaderSummaryWeeklyScheduleSlot,
  failure: ReaderSummaryWeeklyScheduledFailure,
  finalRetryDecision: ReaderSummaryWeeklySlotTerminalDiagnostic["finalRetryDecision"],
): ReaderSummaryWeeklySlotTerminalDiagnostic => Object.freeze({
  slotIdentity: slot.identity,
  ...safeFailure(failure),
  finalRetryDecision,
});

const safeFailure = (
  failure: ReaderSummaryWeeklyScheduledFailure,
): ReaderSummaryWeeklyScheduledFailure => Object.freeze({
  category: failure.category,
  retryable: failure.retryable,
  code: safeToken(failure.code),
  cause: safeToken(failure.cause),
});

const safeToken = (value: string): string =>
  /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : "unclassified";
