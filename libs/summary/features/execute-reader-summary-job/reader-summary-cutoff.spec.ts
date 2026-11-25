import { cutoffScenario, cutoffA, cutoffB, cutoffScope, cutoffPeriod } from "./reader-summary-cutoff.spec-support";

import { ReaderSummaryJob, buildReaderSummaryPeriod } from "../../domain";
import type { ReaderSummaryPreparationManifest } from "../../domain";
import type { ReaderSummaryNewInputRefreshAuthority } from "../../application/contracts/reader-summary-new-input-refresh-authority";
import { ExecuteReaderSummaryJobUseCase } from "./execute-reader-summary-job.use-case";

describe("cutoff admission before side effects", () => {
  it.each([
    ["invalid", new Date(NaN)],
    ["future", new Date("2026-06-26T13:00:00.001Z")],
    ["before period", new Date("2026-06-25T23:59:59.999Z")],
    ["end exclusive", new Date("2026-06-27T00:00:00Z")],
  ])("rejects %s before claim or provider", async (_label, observedThrough) => {
    const s = await cutoffScenario();
    const result = await s.execute.execute({ ...cutoffScope, readerSummaryJobId: "cutoff-job", observedThrough });
    expect(result).toMatchObject({ ok: false, error: { code: "validation.failed" } });
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.select).not.toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
    expect(s.job.toSnapshot().status).toBe("requested");
  });

  it.each([
    ["historical day", { ...cutoffPeriod, startedAt: new Date("2026-06-25T00:00:00Z"), endedAt: new Date("2026-06-26T00:00:00Z") }, new Date("2026-06-25T12:00:00Z")],
    ["custom", { ...cutoffPeriod, cadence: "custom" as const }, cutoffA],
    ["non-UTC", { ...cutoffPeriod, timezone: "Europe/London" }, cutoffA],
    ["non-midnight", { ...cutoffPeriod, startedAt: new Date("2026-06-26T01:00:00Z"), endedAt: new Date("2026-06-27T01:00:00Z") }, cutoffA],
  ])("rejects unsupported %s period", async (_label, period, observedThrough) => {
    const job = ReaderSummaryJob.request({ ...cutoffScope, id: "cutoff-job", scope: { type: "workspace" },
      period: buildReaderSummaryPeriod(period), idempotencyKey: "live-A", requestedAt: cutoffA });
    const s = await cutoffScenario({ job });
    const result = await s.execute.execute({ ...cutoffScope, readerSummaryJobId: "cutoff-job", observedThrough });
    expect(result).toMatchObject({ ok: false, error: { code: "validation.failed" } });
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.select).not.toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
  });

  it.each([cutoffA, cutoffB, new Date(NaN), new Date("2026-06-26T14:00:00Z")])("never grants refresh authority from an explicit date %s", async (observedThrough) => {
    const authority: ReaderSummaryNewInputRefreshAuthority = { claim: jest.fn(async () => cutoffA) };
    const job = ReaderSummaryJob.request({ ...cutoffScope, id: "cutoff-job", scope: { type: "workspace" },
      period: cutoffPeriod, idempotencyKey: "new-input-refresh:v1:fixture", requestedAt: cutoffA });
    const s = await cutoffScenario({ job, authority });
    const result = await s.execute.execute({ ...cutoffScope, readerSummaryJobId: "cutoff-job", observedThrough });
    expect(result).toMatchObject({ ok: false, error: { code: "operation.conflict" } });
    expect(authority.claim).not.toHaveBeenCalled();
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.select).not.toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
  });

  it.each([false, true].flatMap((frozen) =>
    [cutoffA, cutoffB, new Date(NaN), new Date("2026-06-26T14:00:00Z")].map((observedThrough) => [frozen, observedThrough] as const)))(
    "rejects explicit V3 before preparation, frozen=%s cutoff=%s", async (frozen, observedThrough) => {
    const manifest: ReaderSummaryPreparationManifest = { schemaVersion: "reader_summary_preparation_manifest.v1",
      cutoffAt: "2026-06-26T12:00:00.000001Z", interestSha256: "1".repeat(64), rubricSha256: "2".repeat(64),
      inputBuilderVersion: "fixture.v1", modelConfigVersion: "fixture.v1", candidates: [] };
    const requested = ReaderSummaryJob.request({ ...cutoffScope, id: "cutoff-job", scope: { type: "workspace" },
      period: cutoffPeriod, idempotencyKey: "v3-fixture", requestedAt: cutoffA, selectionStrategy: "jev_primary_v3" });
    const job = frozen ? ReaderSummaryJob.rehydrate({ ...requested.toSnapshot(), preparationManifest: manifest }) : requested;
    const preflight = { advance: jest.fn(async () => ({ kind: "deferred" as const, job })), markProviderStarted: jest.fn(async () => false) };
    const s = await cutoffScenario({ job, preflight });
    const result = await s.execute.execute({ ...cutoffScope, readerSummaryJobId: "cutoff-job", observedThrough });
    expect(result).toMatchObject({ ok: false, error: { code: "operation.conflict" } });
    expect(preflight.advance).not.toHaveBeenCalled();
    expect(preflight.markProviderStarted).not.toHaveBeenCalled();
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
  });

});

describe("execution lifecycle with an explicit boundary", () => {
  it.each(["completed", "no_signal", "failed"] as const)("validates before returning terminal %s without rerunning it", async (status) => {
    const requested = ReaderSummaryJob.request({ ...cutoffScope, id: "cutoff-job", scope: { type: "workspace" },
      period: cutoffPeriod, idempotencyKey: "live-A", requestedAt: cutoffA });
    const running = requested.start({ startedAt: cutoffA });
    const job = status === "completed" ? running.complete({ completedAt: cutoffB, readerSummaryId: "existing-artifact" })
      : status === "no_signal" ? running.markNoSignal({ completedAt: cutoffB, readerSummaryId: "existing-artifact" })
      : running.failTerminal({ failedAt: cutoffB, failureReason: "Synthetic terminal failure", terminalFailureCode: "provider_execution_failed" });
    const s = await cutoffScenario({ job });
    const command = { ...cutoffScope, readerSummaryJobId: "cutoff-job" };
    expect(await s.execute.execute({ ...command, observedThrough: new Date(NaN) })).toMatchObject({ ok: false });
    expect(await s.execute.execute({ ...command, observedThrough: cutoffA })).toMatchObject({ ok: true, value: { status } });
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.select).not.toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
    expect(s.publish).not.toHaveBeenCalled();
  });

  it("cannot use live cutoff input to authorize historical omission", async () => {
    const s = await cutoffScenario();
    const dependencies = [...s.dependencies] as ConstructorParameters<typeof ExecuteReaderSummaryJobUseCase>;
    dependencies[14] = { reason: "Synthetic recovery boundary", authorizedAt: cutoffB };
    const result = await new ExecuteReaderSummaryJobUseCase(...dependencies).execute({ ...cutoffScope,
      readerSummaryJobId: "cutoff-job", observedThrough: cutoffA });
    expect(result).toMatchObject({ ok: false, error: { code: "operation.conflict" } });
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.select).not.toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
  });
});
