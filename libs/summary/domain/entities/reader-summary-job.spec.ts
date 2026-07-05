import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import { ReaderSummaryJob } from "./reader-summary-job";

const period: ReaderSummaryPeriod = {
  cadence: "daily",
  startedAt: new Date("2026-06-22T00:00:00.000Z"),
  endedAt: new Date("2026-06-23T00:00:00.000Z"),
  timezone: "UTC",
  periodKey:
    "daily:2026-06-22T00:00:00.000Z:2026-06-23T00:00:00.000Z:UTC",
};

describe("ReaderSummaryJob", () => {
  it("moves through the request lifecycle with reader summary language", () => {
    const requestedAt = new Date("2026-06-22T10:00:00.000Z");
    const startedAt = new Date("2026-06-22T10:01:00.000Z");
    const completedAt = new Date("2026-06-22T10:02:00.000Z");

    const completed = ReaderSummaryJob.request({
      id: "reader-summary-job-1",
      tenantId: tenantId("tenant-reader-summary-job"),
      workspaceId: workspaceId("workspace-reader-summary-job"),
      scope: { type: "workspace" },
      period,
      idempotencyKey: "reader-summary-job-idempotency-key",
      requestedAt,
    })
      .start({ startedAt })
      .complete({
        completedAt,
        readerSummaryId: "reader-summary-1",
      });

    expect(completed.toSnapshot()).toEqual(
      expect.objectContaining({
        id: "reader-summary-job-1",
        status: "completed",
        period,
        readerSummaryId: "reader-summary-1",
        requestedAt,
        startedAt,
        completedAt,
      }),
    );
  });

  it("keeps retry scoped to failed jobs", () => {
    const requestedAt = new Date("2026-06-22T10:00:00.000Z");

    const job = ReaderSummaryJob.request({
      id: "reader-summary-job-2",
      tenantId: tenantId("tenant-reader-summary-job-retry"),
      workspaceId: workspaceId("workspace-reader-summary-job-retry"),
      scope: { type: "interest", interestId: "interest-ai" },
      period,
      idempotencyKey: "reader-summary-job-retry-key",
      requestedAt,
    });

    expect(() =>
      job.retry({
        requestedAt: new Date("2026-06-22T10:03:00.000Z"),
      }),
    ).toThrow("Reader summary job can only retry from failed status");
  });

  it("treats quality rejection as non-retryable terminal outcome with artifact diagnostics", () => {
    const requestedAt = new Date("2026-06-22T10:00:00.000Z");
    const startedAt = new Date("2026-06-22T10:01:00.000Z");
    const rejectedAt = new Date("2026-06-22T10:02:00.000Z");

    const rejected = ReaderSummaryJob.request({
      id: "reader-summary-job-quality-rejected",
      tenantId: tenantId("tenant-reader-summary-job-quality-rejected"),
      workspaceId: workspaceId("workspace-reader-summary-job-quality-rejected"),
      scope: { type: "workspace" },
      period,
      idempotencyKey: "reader-summary-job-quality-rejected-key",
      requestedAt,
    })
      .start({ startedAt })
      .rejectForQuality({
        rejectedAt,
        readerSummaryId: "reader-summary-rejected-1",
        failureReason: "Reader summary failed pre-publish quality gate.",
      });

    expect(rejected.toSnapshot()).toEqual(
      expect.objectContaining({
        status: "quality_rejected",
        readerSummaryId: "reader-summary-rejected-1",
        failedAt: rejectedAt,
      }),
    );
    expect(() =>
      rejected.retry({
        requestedAt: new Date("2026-06-22T10:03:00.000Z"),
      }),
    ).toThrow("Reader summary job can only retry from failed status");
    expect(() =>
      ReaderSummaryJob.rehydrate({
        ...rejected.toSnapshot(),
        readerSummaryId: undefined,
      }),
    ).toThrow(
      "Quality rejected reader summary job must reference a rejected artifact",
    );
  });
});
