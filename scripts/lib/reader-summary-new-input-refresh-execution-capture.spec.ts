import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as postgres from "./reader-summary-new-input-refresh-postgres";
import * as guard from "./reader-summary-new-input-refresh-guard";
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
