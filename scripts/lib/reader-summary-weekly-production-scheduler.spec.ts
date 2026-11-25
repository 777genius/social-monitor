import {
  deriveReaderSummaryWeeklyScheduleSlot,
} from "../../libs/summary/domain/policies/reader-summary-weekly-schedule-policy";
import {
  ReaderSummaryWeeklyScheduledExecutionError,
  runReaderSummaryWeeklyProductionSchedule,
} from "./reader-summary-weekly-production-scheduler";

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";

describe("reader summary weekly production scheduler", () => {
  it("executes bounded missing slots oldest first", async () => {
    const weeks: string[] = [];
    const result = await runReaderSummaryWeeklyProductionSchedule({
      tenantId,
      workspaceId,
      firstWeekStartedUtcDate: "2026-06-29",
      now: new Date("2026-08-03T06:30:00.000Z"),
      catchUpLimit: 2,
      observedSlots: [{
        slot: slot("2026-07-06", "2026-07-12"),
        state: "completed",
      }],
      execute: async (candidate) => {
        weeks.push(candidate.weekStartedUtcDate);
        return { status: "completed" };
      },
      wait: async () => undefined,
    });

    expect(weeks).toEqual(["2026-06-29", "2026-07-13"]);
    expect(result).toEqual({
      planned: 2,
      completed: 2,
      terminal: 0,
      deferred: 2,
      terminalDiagnostics: [],
    });
  });

  it("bounds typed transient failures and retains the final retry decision", async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await runReaderSummaryWeeklyProductionSchedule({
      tenantId,
      workspaceId,
      firstWeekStartedUtcDate: "2026-07-20",
      now: new Date("2026-07-27T06:30:00.000Z"),
      catchUpLimit: 1,
      observedSlots: [],
      execute: async () => {
        calls += 1;
        throw new ReaderSummaryWeeklyScheduledExecutionError("temporary DB", {
          category: "infrastructure",
          retryable: true,
          code: "backend_unavailable",
          cause: "subscription_runtime",
        });
      },
      wait: async (milliseconds) => { waits.push(milliseconds); },
    });

    expect(calls).toBe(3);
    expect(waits).toEqual([60_000, 300_000]);
    expect(result.terminal).toBe(1);
    expect(result.terminalDiagnostics).toMatchObject([{
      category: "infrastructure",
      retryable: true,
      code: "backend_unavailable",
      cause: "subscription_runtime",
      finalRetryDecision: "attempt_limit_reached",
    }]);
  });

  it("never retries a typed terminal failure", async () => {
    let calls = 0;
    const result = await runReaderSummaryWeeklyProductionSchedule({
      tenantId,
      workspaceId,
      firstWeekStartedUtcDate: "2026-07-20",
      now: new Date("2026-07-27T06:30:00.000Z"),
      catchUpLimit: 1,
      observedSlots: [],
      execute: async () => {
        calls += 1;
        throw new ReaderSummaryWeeklyScheduledExecutionError("permission denied", {
          category: "infrastructure",
          retryable: false,
          code: "permission_required",
          cause: "subscription_auth",
        });
      },
      wait: async () => { throw new Error("unexpected retry"); },
    });

    expect(calls).toBe(1);
    expect(result.terminal).toBe(1);
    expect(result.terminalDiagnostics).toMatchObject([{
      category: "infrastructure",
      retryable: false,
      code: "permission_required",
      cause: "subscription_auth",
      finalRetryDecision: "infrastructure_not_retryable",
    }]);
  });

  it("uses the acquired receipt attempt after a scheduler restart", async () => {
    const schedulerAttempts: number[] = [];
    const acquiredAttempts: number[] = [];
    const result = await runReaderSummaryWeeklyProductionSchedule({
      tenantId,
      workspaceId,
      firstWeekStartedUtcDate: "2026-07-20",
      now: new Date("2026-07-27T06:30:00.000Z"),
      catchUpLimit: 1,
      observedSlots: [],
      execute: async (_slot, schedulerAttempt) => {
        schedulerAttempts.push(schedulerAttempt);
        const acquiredAttempt = schedulerAttempt === 1 ? 2 : schedulerAttempt;
        acquiredAttempts.push(acquiredAttempt);
        throw new ReaderSummaryWeeklyScheduledExecutionError("temporary runtime", {
          category: "infrastructure",
          retryable: true,
          code: "backend_unavailable",
          cause: "subscription_runtime",
        }, acquiredAttempt);
      },
      wait: async () => undefined,
    });

    expect(schedulerAttempts).toEqual([1, 3]);
    expect(acquiredAttempts).toEqual([2, 3]);
    expect(result.terminalDiagnostics[0]).toMatchObject({
      finalRetryDecision: "attempt_limit_reached",
    });
  });
});

const slot = (weekStartedUtcDate: string, weekEndedUtcDate: string) =>
  deriveReaderSummaryWeeklyScheduleSlot({
    tenantId,
    workspaceId,
    weekStartedUtcDate,
    weekEndedUtcDate,
  });
