import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, type ReaderSummaryPeriod } from "../../domain";
import { InMemoryReaderSummaryJobRepository } from "./in-memory-reader-summary-job.repository";

const tenant = tenantId("tenant-reader-summary-lease");
const workspace = workspaceId("workspace-reader-summary-lease");
const period: ReaderSummaryPeriod = {
  cadence: "daily",
  startedAt: new Date("2026-08-13T00:00:00.000Z"),
  endedAt: new Date("2026-08-14T00:00:00.000Z"),
  timezone: "UTC",
  periodKey:
    "daily:2026-08-13T00:00:00.000Z:2026-08-14T00:00:00.000Z:UTC",
};

describe("InMemoryReaderSummaryJobRepository execution lease", () => {
  it("rejects a fresh running claim", async () => {
    const jobs = await runningRepository("2026-08-14T12:15:00.000Z");

    const claim = await jobs.claimForExecution(
      claimParams("2026-08-14T12:30:00.000Z"),
    );

    expect(claim).toBeNull();
  });

  it("atomically reclaims a stale running claim with a new fence", async () => {
    const jobs = await runningRepository("2026-08-14T12:00:00.000Z");

    const claim = await jobs.claimForExecution(
      claimParams("2026-08-14T12:30:00.000Z"),
    );

    expect(claim?.toSnapshot()).toMatchObject({
      id: "reader-summary-lease-job",
      status: "running",
      idempotencyKey: "reader-summary:daily:2026-08-13",
      requestedAt: new Date("2026-08-14T12:30:00.000Z"),
      startedAt: new Date("2026-08-14T12:30:00.000Z"),
    });
  });

  it("allows only one competing claimant to recover a stale job", async () => {
    const jobs = await runningRepository("2026-08-14T12:00:00.000Z");

    const claims = await Promise.all([
      jobs.claimForExecution(claimParams("2026-08-14T12:30:00.000Z")),
      jobs.claimForExecution(claimParams("2026-08-14T12:30:01.000Z")),
    ]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });

  it("fences an outcome written by the interrupted claimant", async () => {
    const jobs = await runningRepository("2026-08-14T12:00:00.000Z");
    const oldRunning = (await jobs.findById(findParams()))!;
    await jobs.claimForExecution(claimParams("2026-08-14T12:30:00.000Z"));

    const saved = await jobs.saveExecutionOutcome({
      job: oldRunning.fail({
        failedAt: new Date("2026-08-14T12:31:00.000Z"),
        failureReason: "Interrupted claimant resumed",
      }),
      expectedStartedAt: new Date("2026-08-14T12:00:00.000Z"),
    });

    expect(saved).toBe(false);
    expect((await jobs.findById(findParams()))?.toSnapshot()).toMatchObject({
      status: "running",
      startedAt: new Date("2026-08-14T12:30:00.000Z"),
    });
  });
});

const runningRepository = async (
  startedAt: string,
): Promise<InMemoryReaderSummaryJobRepository> => {
  const jobs = new InMemoryReaderSummaryJobRepository();
  await jobs.save(
    ReaderSummaryJob.request({
      id: "reader-summary-lease-job",
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
      idempotencyKey: "reader-summary:daily:2026-08-13",
      requestedAt: new Date("2026-08-14T11:59:00.000Z"),
    }).start({ startedAt: new Date(startedAt) }),
  );
  return jobs;
};

const findParams = () => ({
  tenantId: tenant,
  workspaceId: workspace,
  readerSummaryJobId: "reader-summary-lease-job",
});

const claimParams = (startedAt: string) => ({
  ...findParams(),
  requestedAt: new Date(startedAt),
  startedAt: new Date(startedAt),
  staleRunningStartedBefore: new Date("2026-08-14T12:15:00.000Z"),
});
