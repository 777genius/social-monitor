import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob, readerSummaryWorkspaceManifestSha256 } from
  "../../domain";
import type { ReaderSummaryV3PreparationSourcePort } from "../../ports";
import { InMemoryReaderSummaryJobRepository } from
  "./in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryV3Preflight } from
  "./in-memory-reader-summary-v3-preflight";
import { ExecuteReaderSummaryJobUseCase } from
  "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl } from
  "../../features/execute-reader-summary-job/reader-summary-promotion-control";

describe("V3 execution recovery", () => {
  it("runs a recovered frozen workspace claim once and fences its redelivery", async () => {
    const claimedAt = new Date("2026-09-21T00:00:00Z");
    const redeliveredAt = new Date("2026-09-23T00:00:00Z");
    const config = { schemaVersion: "reader_summary_preparation_config.v2" as const,
      interests: [{ schemaVersion: "reader_summary_preparation_config.v1" as const,
        interestId: id(4), interestSha256: "1".repeat(64),
        rubricVersion: "reader-value.v1", rubricSha256: "2".repeat(64),
        inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" }] };
    const period = { cadence: "daily" as const,
      startedAt: new Date("2026-09-19T00:00:00Z"),
      endedAt: new Date("2026-09-20T00:00:00Z"), timezone: "UTC",
      periodKey: "daily:2026-09-19T00:00:00.000Z:2026-09-20T00:00:00.000Z:UTC" };
    const manifest = { schemaVersion: "reader_summary_preparation_manifest.v2" as const,
      cutoffAt: "2026-09-21T00:00:00.000000Z", periodKey: period.periodKey,
      interests: config.interests, candidates: [] };
    const original = ReaderSummaryJob.request({ id: id(1), tenantId: tenantId(id(2)),
      workspaceId: workspaceId(id(3)), scope: { type: "workspace" }, period,
      idempotencyKey: "v3-recovery", requestedAt: claimedAt,
      selectionStrategy: "jev_primary_v3" }).freezePreparation({
        strategy: "jev_primary_v3", config, cutoffAt: manifest.cutoffAt,
        deadlineAt: "2026-09-21T00:15:00.000000Z",
        nextCheckAt: new Date("2026-09-21T00:00:10Z"),
      }).freezePreparationManifest({ manifest,
        manifestSha256: readerSummaryWorkspaceManifestSha256(manifest) });
    const crashed = ReaderSummaryJob.rehydrate({ ...original.startPrepared({
      startedAt: claimedAt, readyAt: claimedAt }).toSnapshot(),
      failureReason: "v3_pre_provider_claim" });
    const jobs = new InMemoryReaderSummaryJobRepository();
    await jobs.save(crashed);
    const source = { configuration: jest.fn(), prepare: jest.fn(),
      coverage: jest.fn() } as ReaderSummaryV3PreparationSourcePort;
    const preflight = new InMemoryReaderSummaryV3Preflight(jobs, source);
    const build = jest.fn(async () => ({ kind: "presentation_unavailable" as const }));
    const useCase = new ExecuteReaderSummaryJobUseCase(jobs,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      { generate: () => id(5) }, new FixedClock(redeliveredAt),
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, preflight, { build });
    const command = { tenantId: crashed.toSnapshot().tenantId,
      workspaceId: crashed.toSnapshot().workspaceId,
      readerSummaryJobId: crashed.toSnapshot().id };

    await expect(useCase.execute(command)).resolves.toMatchObject({ ok: true,
      value: { status: "failed" } });
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ manifest }));
    expect((await jobs.findById(command))?.toSnapshot()).toMatchObject({
      status: "failed", terminalFailureCode: "presentation_unavailable",
      preparationManifestSha256: crashed.toSnapshot().preparationManifestSha256 });
    await expect(useCase.execute(command)).resolves.toMatchObject({ ok: true,
      value: { status: "failed" } });
    expect(build).toHaveBeenCalledTimes(1);
    expect(source.prepare).not.toHaveBeenCalled();
  });
});

const id = (ordinal: number) =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
