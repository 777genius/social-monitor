import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { FakeReaderSummaryJobRepository } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.spec-support";
import { PromotionControlArtifactRepository, PromotionControlCapturingModel, PromotionControlIdGenerator,
  PromotionControlPolicyRepository } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job-promotion-control.spec-support";
import { readerSummaryPromotionControl, NOOP_READER_SUMMARY_PROMOTION_METRICS } from
  "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { selection, xEvidence } from "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate.spec-support";
import { refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { NewInputRefreshGuard } from "./reader-summary-new-input-refresh-guard";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { withRefreshSelectionAudit } from "./reader-summary-new-input-refresh-selection-audit";

it("a failed diagnostic write consumes the job and cannot retry even with fresh guard composition", async () => {
  const m = refreshManifest(), jobs = new FakeReaderSummaryJobRepository();
  const scope = { tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId) };
  const job = ReaderSummaryJob.request({ ...scope, id: "audit-job", scope: { type: "workspace" },
    period: refreshPeriod(m.date), idempotencyKey: m.operation, requestedAt: refreshNow });
  await jobs.save(job);
  const artifacts = new PromotionControlArtifactRepository(), model = new PromotionControlCapturingModel();
  const evidence = selection([xEvidence("synthetic", 500)], []);
  const select = jest.fn(async () => ({ ...evidence,
    sourceWindow: { ...evidence.sourceWindow, ingestionCutoff: new Date(m.observedThrough) } }));
  const record = jest.fn(() => { throw new Error("synthetic private journal failure"); }), publish = jest.fn();
  const execute = () => {
    const guard = new NewInputRefreshGuard(m, "audit-job", { now: () => refreshNow,
      assertFences: jest.fn(), assertCurrent: async () => undefined });
    return new ExecuteReaderSummaryJobUseCase(jobs, artifacts, new PromotionControlPolicyRepository(),
      withRefreshSelectionAudit({ selector: guard.selector({ select }), manifest: m, jobId: "audit-job",
        record, invalidate: () => guard.invalidate() }), model, { publish }, new PromotionControlIdGenerator(),
      new FixedClock(refreshNow), readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, guard)
      .execute({ ...scope, readerSummaryJobId: "audit-job" });
  };
  expect(await execute()).toMatchObject({ ok: false });
  const failed = (await jobs.findById({ ...scope, readerSummaryJobId: "audit-job" }))!.toSnapshot();
  expect(failed.status).toBe("failed");
  expect(await execute()).toMatchObject({ ok: false, error: { code: "operation.conflict" } });
  expect((await jobs.findById({ ...scope, readerSummaryJobId: "audit-job" }))!.toSnapshot()).toEqual(failed);
  expect(select).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledTimes(1);
  expect(model.generatedEvidenceIds()).toEqual([]);
  expect(artifacts.all()).toEqual([]);
  expect(publish).not.toHaveBeenCalled();
});

it.each(["resolve", "reject"])("awaits an asynchronous journal %s in the consumed-job use case", async (outcome) => {
  let settle!: () => void;
  const failure = new Error("synthetic private async journal failure");
  const pending = new Promise<void>((resolve, reject) => {
    settle = outcome === "resolve" ? resolve : () => reject(failure);
  });
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const record = jest.fn(() => { started(); return pending; });
  const test = await asyncAuditExecution(record);
  const running = test.execute();
  await entered;
  await new Promise<void>((resolve) => setImmediate(resolve));
  const downstreamBeforeRecord = test.findByScope.mock.calls.length;
  const before = await test.snapshot();
  const retryWhilePending = await test.execute();
  settle();
  const result = await running;
  expect(downstreamBeforeRecord).toBe(0);
  expect(before.status).toBe("running");
  expect(retryWhilePending).toMatchObject({ ok: false, error: { code: "operation.conflict" } });
  // Successful journaling reaches the next policy boundary; stop there using a synthetic failure.
  expect(result).toEqual({ ok: false, error: outcome === "resolve" ? test.policyStop : failure });
  expect(test.findByScope).toHaveBeenCalledTimes(outcome === "resolve" ? 1 : 0);
  expect(test.invalidate).toHaveBeenCalledTimes(outcome === "reject" ? 1 : 0);
  const failed = await test.snapshot();
  expect(failed.status).toBe("failed");
  expect(await test.execute()).toMatchObject({ ok: false, error: { code: "operation.conflict" } });
  expect(await test.snapshot()).toEqual(failed);
  expect(test.select).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledTimes(1);
  expect(test.claim).toHaveBeenCalledTimes(1);
  expect(test.saveOutcome).toHaveBeenCalledTimes(1);
  expect(test.model.generatedEvidenceIds()).toEqual([]);
  expect(test.artifacts.all()).toEqual([]);
  expect(test.publish).not.toHaveBeenCalled();
});

async function asyncAuditExecution(record: (event: unknown) => void | Promise<void>) {
  const m = refreshManifest(), jobs = new FakeReaderSummaryJobRepository();
  const scope = { tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId) };
  const job = ReaderSummaryJob.request({ ...scope, id: "audit-job", scope: { type: "workspace" },
    period: refreshPeriod(m.date), idempotencyKey: m.operation, requestedAt: refreshNow });
  await jobs.save(job);
  const claim = jest.spyOn(jobs, "claimForExecution"), saveOutcome = jest.spyOn(jobs, "saveExecutionOutcome");
  const artifacts = new PromotionControlArtifactRepository(), model = new PromotionControlCapturingModel();
  const evidence = selection([xEvidence("synthetic", 500)], []);
  const select = jest.fn(async () => ({ ...evidence,
    sourceWindow: { ...evidence.sourceWindow, ingestionCutoff: new Date(m.observedThrough) } }));
  const publish = jest.fn(), invalidate = jest.fn();
  const policyStop = new Error("synthetic stop after recorded selection"), policies = new PromotionControlPolicyRepository();
  const findByScope = jest.spyOn(policies, "findByScope").mockRejectedValue(policyStop);
  const execute = () => {
    const guard = new NewInputRefreshGuard(m, "audit-job", { now: () => refreshNow,
      assertFences: jest.fn(), assertCurrent: async () => undefined });
    return new ExecuteReaderSummaryJobUseCase(jobs, artifacts, policies,
      withRefreshSelectionAudit({ selector: guard.selector({ select }), manifest: m, jobId: "audit-job",
        record, invalidate: () => { invalidate(); guard.invalidate(); } }), model, { publish }, new PromotionControlIdGenerator(),
      new FixedClock(refreshNow), readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, guard)
      .execute({ ...scope, readerSummaryJobId: "audit-job" });
  };
  const snapshot = async () => (await jobs.findById({ ...scope, readerSummaryJobId: "audit-job" }))!.toSnapshot();
  return { execute, snapshot, select, findByScope, invalidate, policyStop, claim, saveOutcome, model, artifacts, publish };
}
