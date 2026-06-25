import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob } from "./reader-summary-job";

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
      scope: { type: "topic", topicId: "topic-ai" },
      idempotencyKey: "reader-summary-job-retry-key",
      requestedAt,
    });

    expect(() =>
      job.retry({
        requestedAt: new Date("2026-06-22T10:03:00.000Z"),
      }),
    ).toThrow("Reader summary job can only retry from failed status");
  });
});
