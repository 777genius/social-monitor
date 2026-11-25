import { FixedClock, ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob } from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";
import { readerSummaryTransientRecoveryKey } from "../../domain/policies/reader-summary-transient-recovery";
import { RequestReaderSummaryUseCase } from "./request-reader-summary.use-case";

const now = new Date("2026-11-02T10:00:00Z");
const period = { cadence: "daily" as const, startedAt: new Date("2026-11-01T00:00:00Z"),
  endedAt: new Date("2026-11-02T00:00:00Z"), timezone: "UTC",
  periodKey: "daily:2026-11-01T00:00:00.000Z:2026-11-02T00:00:00.000Z:UTC" };
const command = { tenantId: tenantId("tenant-recovery"), workspaceId: workspaceId("workspace-recovery"),
  scope: { type: "workspace" as const }, cadence: "daily" as const,
  period, idempotencyKey: "periodic-daily", correlationId: "recovery-test",
  recoverTransientFailure: true as const };
const failed = (key = command.idempotencyKey) => ReaderSummaryJob.rehydrate({
  ...command, id: key, idempotencyKey: key, period, selectionStrategy: "jev_primary_v3",
  status: "failed", requestedAt: new Date("2026-11-02T08:15:00Z"),
  failedAt: new Date("2026-11-02T08:27:00Z"),
  failureReason: "presentation_runtime_failure_repeated:task_timeout:executions_closed",
  terminalFailureCode: "presentation_dependency_unavailable",
});

const repository = (): ReaderSummaryJobRepositoryPort => {
  const rows = new Map<string, ReaderSummaryJob>();
  return {
    save: async job => { rows.set(job.toSnapshot().idempotencyKey, job); },
    findByIdempotencyKey: async query => {
      const job = rows.get(query.idempotencyKey);
      const s = job?.toSnapshot();
      return s?.tenantId === query.tenantId && s.workspaceId === query.workspaceId ? job! : null;
    },
    findById: jest.fn(), findRequested: jest.fn(),
    claimForExecution: jest.fn(), saveExecutionOutcome: jest.fn(),
  };
};

describe("bounded periodic summary recovery", () => {
  it("persists at most two idempotent replacement jobs, including after a process restart", async () => {
    const jobs = repository();
    const enqueue = jest.fn();
    let sequence = 0;
    const startProcess = () => new RequestReaderSummaryUseCase(jobs,
      { canAccept: async () => true, enqueue },
      { reserveSummaryJob: async () => ok({ remaining: 10, resetAt: "2026-11-03T00:00:00Z" }) },
      { generate: () => `replacement-${++sequence}` }, new FixedClock(now),
      { resolve: () => "jev_primary_v3" });
    await jobs.save(failed());
    expect(await startProcess().execute(command)).toMatchObject({ ok: true,
      value: { created: true, status: "requested" } });
    expect(await startProcess().execute(command)).toMatchObject({ ok: true,
      value: { created: false, status: "requested" } });
    expect(enqueue).toHaveBeenCalledTimes(1);
    await jobs.save(failed("periodic-daily:transient-retry:1"));
    expect(await startProcess().execute(command)).toMatchObject({ ok: true, value: { created: true } });
    await jobs.save(failed("periodic-daily:transient-retry:2"));
    expect(await startProcess().execute(command)).toMatchObject({ ok: true,
      value: { created: false, status: "failed" } });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("waits for backoff and refuses unknown effects, auth, quality, expired or native work", () => {
    const snapshot = failed().toSnapshot();
    expect(readerSummaryTransientRecoveryKey(snapshot, now)).toBe("periodic-daily:transient-retry:1");
    for (const patch of [
      { failedAt: new Date(now.getTime() - 1000) },
      { failureReason: "presentation_runtime_failure_repeated:task_timeout" },
      { failureReason: "presentation_runtime_failure_repeated:provider_effect_unknown:executions_closed" },
      { failureReason: "Gateway account authorization is not usable" },
      { terminalFailureCode: "presentation_unavailable" as const },
      { status: "running" as const },
      { idempotencyKey: "native-reader-summary-v3:owner" },
      { idempotencyKey: "periodic-daily:transient-retry:3" },
    ]) expect(readerSummaryTransientRecoveryKey({ ...snapshot, ...patch }, now)).toBeUndefined();
    expect(readerSummaryTransientRecoveryKey(snapshot, new Date("2026-11-05T00:00:00Z"))).toBeUndefined();
  });

  it("never retries a failed job for an ordinary API request", async () => {
    const jobs = repository();
    await jobs.save(failed());
    const enqueue = jest.fn();
    const useCase = new RequestReaderSummaryUseCase(jobs,
      { canAccept: async () => true, enqueue },
      { reserveSummaryJob: async () => ok({ remaining: 10, resetAt: "2026-11-03T00:00:00Z" }) },
      { generate: () => "unused" }, new FixedClock(now));
    expect(await useCase.execute({ ...command, recoverTransientFailure: undefined }))
      .toMatchObject({ ok: true, value: { created: false, status: "failed" } });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
