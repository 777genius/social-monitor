import { reconcileRefresh, refreshLiveJobs } from "./reader-summary-new-input-refresh-guard";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";
import type { RefreshJobState, RefreshReconciliationState } from
  "./reader-summary-new-input-refresh-postgres";

const manifest = refreshManifest();
const priorOperation = `new-input-refresh:v1:${manifest.date}:${"b".repeat(64)}`;
const consumedJob: RefreshJobState = {
  jobId: "1767fd5c-2fe5-4fef-84e0-22c380932e81", operation: priorOperation,
  status: "FAILED", artifactId: null, jobSha256: "f".repeat(64),
};
const reconciliation: RefreshReconciliationState = {
  reconciliationId: "00000000-0000-4000-8000-0000000000aa", jobId: consumedJob.jobId,
  operation: priorOperation, jobStatus: "FAILED", jobSha256: consumedJob.jobSha256,
};
const publishedCurrent = { publicationId: "p", artifactId: "p", jobId: "fresh" };
const priorCurrent = { publicationId: manifest.prior.publicationId,
  artifactId: manifest.prior.artifactId, jobId: manifest.prior.jobId };
const freshPublishedJob: RefreshJobState = { jobId: "fresh", operation: manifest.operation,
  status: "COMPLETED", artifactId: "p", jobSha256: "c".repeat(64) };

describe("new-input refresh reconciled admission", () => {
  it("keeps an unreconciled consumed failure blocked", () => {
    expect(() => reconcileRefresh(manifest, [consumedJob], priorCurrent, []))
      .toThrow(/generation budget is consumed/u);
  });

  it("admits exactly one fresh attempt once the consumed failure is reconciled", () => {
    expect(reconcileRefresh(manifest, [consumedJob], priorCurrent, [reconciliation]))
      .toBe("reconciled");
    expect(refreshLiveJobs([consumedJob], [reconciliation], manifest.operation)).toEqual([]);
  });

  it("blocks a second live attempt while the fresh one is still running", () => {
    const running: RefreshJobState = { jobId: "fresh", operation: manifest.operation,
      status: "RUNNING", artifactId: null, jobSha256: "c".repeat(64) };
    expect(refreshLiveJobs([consumedJob, running], [reconciliation], manifest.operation))
      .toEqual([running]);
    expect(() => reconcileRefresh(manifest, [consumedJob, running], priorCurrent, [reconciliation]))
      .toThrow(/generation budget is consumed/u);
  });

  it("still refuses a competing operation that is not the reviewed manifest", () => {
    const competing: RefreshJobState = { jobId: "other", operation: `${priorOperation}x`,
      status: "REQUESTED", artifactId: null, jobSha256: "d".repeat(64) };
    expect(() => reconcileRefresh(manifest, [consumedJob, competing], priorCurrent, [reconciliation]))
      .toThrow(/generation budget is consumed/u);
  });

  it("reports published once the single fresh attempt owns the current publication", () => {
    expect(reconcileRefresh(manifest, [consumedJob, freshPublishedJob], publishedCurrent,
      [reconciliation])).toBe("published");
  });

  it("keeps an unconsumed date unconsumed", () => {
    expect(reconcileRefresh(manifest, [], priorCurrent, [])).toBe("unconsumed");
  });

  it.each([
    ["row digest", { ...consumedJob, jobSha256: "e".repeat(64) }],
    ["status", { ...consumedJob, status: "COMPLETED" }],
    ["operation", { ...consumedJob, operation: `${priorOperation}z` }],
    ["artifact", { ...consumedJob, artifactId: "adopted" }],
  ])("fails closed when the reconciled original %s changed", (_label, job) => {
    expect(() => reconcileRefresh(manifest, [job], priorCurrent, [reconciliation]))
      .toThrow(/reconciled original history changed/u);
  });

  it("refuses to let a reconciliation retire the attempt that owns this operation", () => {
    const selfReconciled: RefreshReconciliationState = { ...reconciliation,
      jobId: "fresh", operation: manifest.operation, jobSha256: "c".repeat(64) };
    const failedFresh: RefreshJobState = { jobId: "fresh", operation: manifest.operation,
      status: "FAILED", artifactId: null, jobSha256: "c".repeat(64) };
    expect(() => refreshLiveJobs([failedFresh], [selfReconciled], manifest.operation))
      .toThrow(/reconciled original history changed/u);
  });

  it("refuses a reconciliation that points at no job of this date", () => {
    expect(() => reconcileRefresh(manifest, [], priorCurrent, [reconciliation]))
      .toThrow(/references an unknown job/u);
  });

  it("refuses a duplicated reconciliation set", () => {
    expect(() => refreshLiveJobs([consumedJob], [reconciliation, reconciliation], manifest.operation))
      .toThrow(/set is ambiguous/u);
  });
});
