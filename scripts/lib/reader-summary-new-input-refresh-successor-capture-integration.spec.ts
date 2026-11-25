import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { parseRefreshCommand } from "../run-reader-summary-new-input-refresh";
import { executeNewInputRefresh } from "./reader-summary-new-input-refresh-execution";
import * as postgres from "./reader-summary-new-input-refresh-postgres";
import * as capture from "./reader-summary-new-input-refresh-capture";
import * as successor from "./reader-summary-new-input-refresh-successor";
import { successorManifest } from "./reader-summary-new-input-refresh-successor.spec-support";
import { refreshNow } from "./reader-summary-new-input-refresh.spec-support";

// Synthetic composition only: no database, network, provider or CLI main.
describe("successor and same-invocation capture integration", () => {
  const hash = "a".repeat(64);
  const prepare = ["--prepare", "--date", "2026-09-03", "--successor", "grant.json", "--sha256", hash];
  const apply = ["--apply", "successor.json", "--sha256", hash];
  const capturedApply = [...apply, "--capture-path", "/tmp/synthetic-capture"];
  const directories: string[] = [];
  afterEach(() => {
    jest.restoreAllMocks();
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  });

  it("retains all exact command arities and keeps capture on apply only", () => {
    expect(prepare).toHaveLength(7);
    expect(parseRefreshCommand(prepare)).toEqual({ mode: "prepare", dates: ["2026-09-03"],
      successor: { path: "grant.json", sha256: hash } });
    expect(apply).toHaveLength(4);
    expect(parseRefreshCommand(apply)).toEqual({ mode: "apply", path: "successor.json", sha256: hash });
    expect(capturedApply).toHaveLength(6);
    expect(parseRefreshCommand(capturedApply)).toEqual({ mode: "apply", path: "successor.json", sha256: hash,
      capturePath: "/tmp/synthetic-capture" });
    expect(parseRefreshCommand([])).toMatchObject({ mode: "prepare" });
    expect(parseRefreshCommand(["--prepare"])).toMatchObject({ mode: "prepare" });
    expect(parseRefreshCommand(prepare.slice(0, 3))).toEqual({ mode: "prepare", dates: ["2026-09-03"] });
    expect(parseRefreshCommand(["--source-sha256"])).toEqual({ mode: "source" });
  });

  it("fails closed on missing, duplicate, reordered, cross-mode and extra arguments", () => {
    const invalid = [
      ...[1, 2, 4, 5, 6].map((n) => prepare.slice(0, n)).filter((args) => args.length !== 1),
      [...prepare, "extra"], [...prepare, "--capture-path", "/tmp/capture"],
      [...apply, "--capture-path"], [...apply, "--capture-path", "relative"],
      [...apply, "--capture-path", ""], [...capturedApply, "extra"],
      [...capturedApply, "--capture-path", "/tmp/duplicate"],
      [...apply, "--successor", "grant.json"],
      ["--capture-path", "/tmp/capture", ...apply],
      ["--prepare", "--successor", "grant.json", "--sha256", hash],
      ["--source-sha256", "--capture-path", "/tmp/capture"],
      [...prepare.slice(0, 6), "A".repeat(64)],
      [...prepare.slice(0, 4), "", "--sha256", hash],
      [...apply.slice(0, 3), "bad", "--capture-path", "/tmp/capture"],
    ];
    for (const args of invalid) expect(() => parseRefreshCommand(args)).toThrow(/--successor.*--capture-path/);
  });

  function input(enabled: boolean): Parameters<typeof executeNewInputRefresh>[0] {
    const manifest = successorManifest();
    const parent = mkdtempSync(join(tmpdir(), "successor-capture-integration-"));
    directories.push(parent);
    jest.spyOn(postgres, "readRefreshCounts").mockResolvedValue({ publications: 1, outbox: 1, jobs: 1, artifacts: 1 });
    jest.spyOn(postgres, "readRefreshPrior").mockResolvedValue(manifest.prior);
    jest.spyOn(postgres, "readRefreshJobs").mockResolvedValue([]);
    jest.spyOn(postgres, "readRefreshReconciliations").mockResolvedValue([]);
    jest.spyOn(successor, "assertRefreshSuccessorCurrent").mockResolvedValue();
    return { manifest, ...(enabled ? { capturePath: join(parent, "capture") } : {}),
      summary: {} as never, feed: {} as never, configuredInterests: { readCurrent: jest.fn() },
      clock: { now: () => refreshNow }, env: {}, runtime: { runTask: jest.fn(), checkHealth: jest.fn() },
      assertFences: jest.fn(), assertSource: jest.fn(), assertRuntime: jest.fn(), record: jest.fn() };
  }

  it.each([false, true])("rejects stale successor authority before runtime, capture=%s", async (enabled) => {
    const value = input(enabled);
    jest.mocked(successor.assertRefreshSuccessorCurrent).mockRejectedValue(new Error("changed reconciliation"));
    await expect(executeNewInputRefresh(value)).rejects.toThrow("changed reconciliation");
    expect(value.runtime.runTask).not.toHaveBeenCalled();
    expect(value.assertRuntime).not.toHaveBeenCalled();
    if (enabled) expect(value.record).toHaveBeenCalledWith(expect.objectContaining({ status: "paired_capture", complete: false }));
  });

  it.each([false, true])("never replays any consumed successor, even reconciled or published, capture=%s", async (enabled) => {
    for (const status of ["REQUESTED", "RUNNING", "FAILED", "QUALITY_REJECTED", "COMPLETED"]) {
      const value = input(enabled);
      const job = { operation: value.manifest.operation, jobId: "synthetic-job", status,
        artifactId: status === "COMPLETED" ? "synthetic-artifact" : null, jobSha256: hash };
      jest.mocked(postgres.readRefreshJobs).mockResolvedValue([job]);
      jest.mocked(postgres.readRefreshReconciliations).mockResolvedValue([{
        reconciliationId: "synthetic-reconciliation", jobId: job.jobId, operation: job.operation,
        jobStatus: status, jobSha256: hash,
      }]);
      await expect(executeNewInputRefresh(value)).rejects.toThrow("Refresh successor already consumed");
      expect(value.runtime.runTask).not.toHaveBeenCalled();
      expect(value.assertRuntime).not.toHaveBeenCalled();
      if (enabled) expect(value.record).toHaveBeenCalledWith(expect.objectContaining({ status: "paired_capture", complete: false }));
    }
  });

  it.each([false, true])("routes real request admission to successor insert only once, capture=%s", async (enabled) => {
    const value = input(enabled);
    jest.spyOn(capture, "captureRefreshAuthority").mockResolvedValue(value.manifest.authority);
    jest.spyOn(capture, "assertRefreshHasNewInput").mockResolvedValue();
    jest.spyOn(capture, "preflightRefreshSelection").mockResolvedValue({ assessmentCandidateCount: 1 } as never);
    jest.spyOn(PrismaReaderSummaryPolicyRepository.prototype, "findByScope").mockResolvedValue({} as never);
    jest.spyOn(PrismaReaderSummaryJobRepository.prototype, "findByIdempotencyKey").mockResolvedValue(null);
    const ordinarySave = jest.spyOn(PrismaReaderSummaryJobRepository.prototype, "save");
    // Stop at the persistence boundary, after the real request use case and
    // both real one-date admission checks, without running any SQL or model.
    const consume = jest.spyOn(successor, "consumeRefreshSuccessor").mockRejectedValue(new Error("synthetic insert refused"));
    await expect(executeNewInputRefresh(value)).rejects.toThrow("synthetic insert refused");
    expect(consume).toHaveBeenCalledTimes(1);
    const consumed = consume.mock.calls[0]![0];
    expect(consumed.manifest).toBe(value.manifest);
    expect(consumed.job.toSnapshot()).toMatchObject({ idempotencyKey: value.manifest.operation, status: "requested" });
    const before = jest.mocked(value.assertFences).mock.calls.length;
    consumed.assertLocal();
    expect(value.assertFences).toHaveBeenCalledTimes(before + 1);
    expect(ordinarySave).not.toHaveBeenCalled();
    expect(value.runtime.runTask).not.toHaveBeenCalled();
    if (enabled) expect(value.record).toHaveBeenCalledWith(expect.objectContaining({ status: "paired_capture", complete: false }));
  });
});
