import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob } from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";
import { GetReaderSummaryJobStatusUseCase } from "./get-reader-summary-job-status.use-case";

describe("GetReaderSummaryJobStatusUseCase", () => {
  it("returns current reader summary job status with timeline", async () => {
    const job = ReaderSummaryJob.request({
      id: "reader-summary-job-1",
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
      idempotencyKey: "reader-summary-1",
      requestedAt: new Date("2026-06-23T08:00:00.000Z"),
    })
      .start({ startedAt: new Date("2026-06-23T08:01:00.000Z") })
      .complete({
        completedAt: new Date("2026-06-23T08:02:00.000Z"),
        readerSummaryId: "reader-summary-1",
      });
    const useCase = new GetReaderSummaryJobStatusUseCase(
      new FakeReaderSummaryJobRepository([job]),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-1",
        scope: { type: "workspace" },
        period: {
          cadence: "daily",
          startedAt: "2026-06-23T00:00:00.000Z",
          endedAt: "2026-06-24T00:00:00.000Z",
          timezone: "UTC",
          periodKey:
            "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
        },
        status: "completed",
        requestedAt: "2026-06-23T08:00:00.000Z",
        startedAt: "2026-06-23T08:01:00.000Z",
        completedAt: "2026-06-23T08:02:00.000Z",
        failedAt: undefined,
        readerSummaryId: "reader-summary-1",
        failureReason: undefined,
        failureClass: undefined,
        timeline: [
          {
            status: "requested",
            occurredAt: "2026-06-23T08:00:00.000Z",
            message: "Reader summary requested",
          },
          {
            status: "running",
            occurredAt: "2026-06-23T08:01:00.000Z",
            message: "Reader summary generation started",
          },
          {
            status: "completed",
            occurredAt: "2026-06-23T08:02:00.000Z",
            message: "Reader summary completed",
          },
        ],
      },
    });
  });

  it("returns quality rejected reader summary job status with failure class", async () => {
    const job = ReaderSummaryJob.rehydrate({
      id: "reader-summary-job-quality-rejected",
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
      status: "quality_rejected",
      idempotencyKey: "reader-summary-quality-rejected",
      requestedAt: new Date("2026-06-23T08:00:00.000Z"),
      startedAt: new Date("2026-06-23T08:01:00.000Z"),
      failedAt: new Date("2026-06-23T08:02:00.000Z"),
      readerSummaryId: "reader-summary-rejected-1",
      failureReason: "Reader summary artifact failed pre-publish quality gate.",
    });
    const useCase = new GetReaderSummaryJobStatusUseCase(
      new FakeReaderSummaryJobRepository([job]),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-quality-rejected",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-quality-rejected",
        status: "quality_rejected",
        readerSummaryId: "reader-summary-rejected-1",
        failureClass: "quality_rejected",
        timeline: expect.arrayContaining([
          {
            status: "quality_rejected",
            occurredAt: "2026-06-23T08:02:00.000Z",
            message: "Reader summary rejected by pre-publish quality gate",
          },
        ]),
      },
    });
  });

  it("returns not found for missing reader summary jobs", async () => {
    const useCase = new GetReaderSummaryJobStatusUseCase(
      new FakeReaderSummaryJobRepository([]),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "missing",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "resource.not_found" }),
    });
  });
});

const tenant = tenantId("tenant-reader-summary-job-status");
const workspace = workspaceId("workspace-reader-summary-job-status");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey:
    "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

class FakeReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  constructor(private readonly jobs: readonly ReaderSummaryJob[]) {}

  async save(job: ReaderSummaryJob): Promise<void> {
    void job;
    return undefined;
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    return (
      this.jobs.find((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.id === params.readerSummaryJobId
        );
      }) ?? null
    );
  }

  async findByIdempotencyKey(): Promise<ReaderSummaryJob | null> {
    return null;
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    return this.jobs
      .filter((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.status === "requested" &&
          (params.tenantId === undefined ||
            snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined ||
            snapshot.workspaceId === params.workspaceId)
        );
      })
      .slice(0, params.limit);
  }

  async claimForExecution(): ReturnType<
    ReaderSummaryJobRepositoryPort["claimForExecution"]
  > {
    return null;
  }
}
