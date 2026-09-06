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
