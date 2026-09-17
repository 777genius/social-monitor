import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import * as postgres from "./reader-summary-new-input-refresh-postgres";
import * as guard from "./reader-summary-new-input-refresh-guard";
import * as capture from "./reader-summary-new-input-refresh-capture";
import { executeNewInputRefresh } from "./reader-summary-new-input-refresh-execution";
import { RefreshPairedExport } from "./reader-summary-new-input-refresh-paired-export";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

// Synthetic terminal-job reconciliation. No DB/network/model entrypoint runs.
describe("refresh capture failure isolation at execution return", () => {
  const directories: string[] = [];
  afterEach(() => {
    jest.restoreAllMocks();
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  });
  function input(capturePath?: string): Parameters<typeof executeNewInputRefresh>[0] {
    const manifest = refreshManifest();
    jest.spyOn(postgres, "readRefreshCounts").mockResolvedValue({ publications: 1, outbox: 1, jobs: 1, artifacts: 1 });
    jest.spyOn(postgres, "readRefreshPrior").mockResolvedValue(manifest.prior);
    jest.spyOn(postgres, "readRefreshJobs").mockResolvedValue([]);
    jest.spyOn(postgres, "readRefreshReconciliations").mockResolvedValue([]);
    jest.spyOn(guard, "reconcileRefresh").mockReturnValue("published");
    return { manifest, capturePath, summary: {} as never, feed: {} as never,
      configuredInterests: { readCurrent: jest.fn() }, clock: { now: () => refreshNow }, env: {},
      runtime: { runTask: jest.fn(), checkHealth: jest.fn() },
      assertFences: () => undefined, assertSource: () => undefined, assertRuntime: jest.fn(), record: jest.fn() };
  }
  it("a finalizer exception cannot replace the existing terminal result or retry a consumed task", async () => {
    const parent = mkdtempSync(join(tmpdir(), "paired-export-execution-")); directories.push(parent);
    const plain = input();
    const expected = await executeNewInputRefresh(plain);
    const captured = input(join(parent, "capture"));
    jest.spyOn(RefreshPairedExport.prototype, "finish").mockRejectedValue(new Error("Synthetic capture failure"));
    expect(await executeNewInputRefresh(captured)).toEqual(expected);
    expect(captured.record).toHaveBeenCalledWith({ status: "paired_capture", complete: false,
      failures: ["capture_finalization_failed"] });
    expect(captured.runtime.runTask).not.toHaveBeenCalled();
    expect(captured.assertRuntime).not.toHaveBeenCalled();
  });
  it("a verified no-op is never certified as a new selector capture", async () => {
    const parent = mkdtempSync(join(tmpdir(), "paired-export-execution-")); directories.push(parent);
    const captured = input(join(parent, "capture"));
    expect(await executeNewInputRefresh(captured)).toMatchObject({ status: "verified_noop" });
    expect(captured.record).toHaveBeenCalledWith(expect.objectContaining({ status: "paired_capture", complete: false }));
    expect(captured.runtime.runTask).not.toHaveBeenCalled();
  });
});

// Zero pending assessment candidates must not short-circuit to no_eligible_input
// when canonical evidence already carries a persisted selectable assessment.
describe("refresh execution admits existing selectable evidence with zero new assessment candidates", () => {
  afterEach(() => jest.restoreAllMocks());
  it("skips no_eligible_input, reaches ExecuteReaderSummaryJobUseCase.execute and publishes", async () => {
    const manifest = refreshManifest();
    const jobId = "synthetic-zero-candidate-job";
    const completedJob = { jobId, operation: manifest.operation, status: "COMPLETED",
      artifactId: "00000000-0000-4000-8000-000000000099", jobSha256: "b".repeat(64) };
    const after = { ...manifest.prior, publicationId: completedJob.artifactId,
      artifactId: completedJob.artifactId, jobId, status: "COMPLETED" as const };
    let priorCalls = 0;
    jest.spyOn(postgres, "readRefreshCounts")
      .mockResolvedValueOnce({ publications: 1, outbox: 1, jobs: 1, artifacts: 1 })
      .mockResolvedValueOnce({ publications: 2, outbox: 2, jobs: 2, artifacts: 2 });
    jest.spyOn(postgres, "readRefreshPrior").mockImplementation(async (_client, _date, publicationId?: string) => {
      if (publicationId !== undefined) return manifest.prior;
      priorCalls += 1;
      return priorCalls <= 3 ? manifest.prior : after;
    });
    jest.spyOn(postgres, "readRefreshJobs").mockResolvedValueOnce([]).mockResolvedValueOnce([completedJob]);
    jest.spyOn(postgres, "readRefreshReconciliations").mockResolvedValue([]);
    jest.spyOn(capture, "captureRefreshAuthority").mockResolvedValue(manifest.authority);
    jest.spyOn(capture, "assertRefreshHasNewInput").mockResolvedValue();
    const selectableEvidence = { feedItemId: "synthetic-selectable", sourceItemId: "source",
      sourceBindingId: "binding", interestId: "interest-ai", providerKey: "reddit",
      canonicalUrl: "https://reddit.example.test/synthetic-selectable", title: "Existing selectable read",
      bodyPreview: "Previously reviewed developer tools coverage.",
      publishedAt: new Date("2026-09-03T08:00:00Z"), observedAt: new Date("2026-09-03T08:01:00Z"),
      contentQuality: { decision: "promote", reason: "promotion_assessment:promote", qualityScore: 0.9,
        eligibleForSummary: true, eligibleForTopRead: false, needsLlmReview: false } };
    jest.spyOn(capture, "preflightRefreshSelection").mockResolvedValue({ assessmentCandidateCount: 0,
      canonicalEvidence: [selectableEvidence] } as never);
    jest.spyOn(PrismaReaderSummaryPolicyRepository.prototype, "findByScope")
      .mockResolvedValue({ toSnapshot: () => ({}) } as never);
    jest.spyOn(RequestReaderSummaryUseCase.prototype, "execute").mockResolvedValue({ ok: true,
      value: { created: true, readerSummaryJobId: jobId } } as never);
    const execute = jest.spyOn(ExecuteReaderSummaryJobUseCase.prototype, "execute")
      .mockResolvedValue({ ok: true, value: {} } as never);
    const record = jest.fn();
    const result = await executeNewInputRefresh({ manifest, summary: {} as never, feed: {} as never,
      configuredInterests: { readCurrent: jest.fn() }, clock: { now: () => refreshNow }, env: {},
      runtime: { runTask: jest.fn(), checkHealth: jest.fn() }, assertFences: () => undefined,
      assertSource: () => undefined, assertRuntime: jest.fn(), record });
    expect(result.status).not.toBe("no_eligible_input");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("published");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: "preflight",
      assessmentCandidateCount: 0, plannedSummaryGenerations: 1 }));
  });
});
