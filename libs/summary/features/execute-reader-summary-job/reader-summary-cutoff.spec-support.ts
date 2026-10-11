import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob, buildReaderSummaryPeriod } from "../../domain";
import type { ReaderSummaryNewInputRefreshAuthority } from "../../application/contracts/reader-summary-new-input-refresh-authority";
import type { ReaderSummaryV3PreflightPort } from "../../ports";
import { ExecuteReaderSummaryJobUseCase } from "./execute-reader-summary-job.use-case";
import { FakeReaderSummaryJobRepository } from "./execute-reader-summary-job.spec-support";
import { PromotionControlArtifactRepository, PromotionControlPolicyRepository, PromotionControlTrendingModel,
  PromotionControlPublication, PromotionControlEventPublisher, PromotionControlIdGenerator,
  promotionControlEmptyTopicMapBuilder } from "./execute-reader-summary-job-promotion-control.spec-support";
import { readerSummaryPromotionControl, NOOP_READER_SUMMARY_PROMOTION_METRICS } from "./reader-summary-promotion-control";

export const cutoffScope = { tenantId: tenantId("cutoff-fixture-tenant"), workspaceId: workspaceId("cutoff-fixture-workspace") };
export const cutoffA = new Date("2026-06-26T12:00:00.000Z");
export const cutoffB = new Date("2026-06-26T13:00:00.000Z");
export const cutoffPeriod = buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC",
  startedAt: new Date("2026-06-26T00:00:00.000Z"), endedAt: new Date("2026-06-27T00:00:00.000Z") });

/** Admission specs deliberately make all execution effects forbidden. Pipeline
 * behavior is exercised separately with concrete adapters in the capture spec. */
export async function cutoffScenario(options: {
  readonly job?: ReaderSummaryJob;
  readonly authority?: ReaderSummaryNewInputRefreshAuthority;
  readonly preflight?: ReaderSummaryV3PreflightPort;
} = {}) {
  const jobs = new FakeReaderSummaryJobRepository();
  const job = options.job ?? ReaderSummaryJob.request({ ...cutoffScope, id: "cutoff-job",
    scope: { type: "workspace" }, period: cutoffPeriod, idempotencyKey: "live-attempt-A", requestedAt: cutoffA });
  await jobs.save(job);
  const claim = jest.spyOn(jobs, "claimForExecution");
  const select = jest.fn(async () => { throw new Error("Admission must stop selection"); });
  const model = new PromotionControlTrendingModel();
  const generate = jest.spyOn(model, "generate");
  const artifacts = new PromotionControlArtifactRepository();
  const publication = new PromotionControlPublication(jobs, artifacts, new PromotionControlEventPublisher());
  const publish = jest.spyOn(publication, "publish");
  const dependencies: ConstructorParameters<typeof ExecuteReaderSummaryJobUseCase> = [jobs, artifacts,
    new PromotionControlPolicyRepository(), { select }, model, publication, new PromotionControlIdGenerator(), new FixedClock(cutoffB),
    readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS), undefined, undefined,
    promotionControlEmptyTopicMapBuilder(), undefined, undefined, undefined, undefined, undefined, options.authority, options.preflight];
  return { job, jobs, claim, select, generate, publish, dependencies, execute: new ExecuteReaderSummaryJobUseCase(...dependencies) };
}
