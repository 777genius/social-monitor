import type { ScanJob } from "@social-monitor/monitoring/domain";
import type { ScanJobRepositoryPort } from "@social-monitor/monitoring/ports";
import {
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ProductionCollectionScanJobReporter } from "./production-collection-scan-job-reporter";

describe("ProductionCollectionScanJobReporter", () => {
  const tenant = tenantId("tenant-1");
  const workspace = workspaceId("workspace-1");
  const requestedAt = new Date("2026-07-21T00:00:00.000Z");

  it("persists every collection attempt as a separate completed scan job", async () => {
    const repository = new RecordingScanJobRepository();
    const reporter = new ProductionCollectionScanJobReporter(
      repository,
      new SequenceIdGenerator(["scan-job-1", "scan-job-2"]),
      new FixedClock(requestedAt),
    );

    const succeededJobId = reporter.beginAttempt({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: "source-binding-1",
      scanPolicyId: "real-scan-policy-1",
    });
    await reporter.reportSucceeded({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: succeededJobId,
      completedAt: new Date("2026-07-21T00:01:00.000Z"),
      collectionTelemetry: { fetchedCount: 7 },
    });

    const failedJobId = reporter.beginAttempt({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: "source-binding-1",
      scanPolicyId: "real-scan-policy-1",
    });
    await reporter.reportFailed({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: failedJobId,
      completedAt: new Date("2026-07-21T00:02:00.000Z"),
      failureReason: "provider retry exhausted",
      failureMetadata: { retryable: true },
      collectionTelemetry: { fetchedCount: 0 },
    });

    expect(repository.saved.map((job) => job.toSnapshot())).toEqual([
      expect.objectContaining({
        id: "scan-job-1",
        sourceBindingId: "source-binding-1",
        scanPolicyId: "real-scan-policy-1",
        status: "succeeded",
        requestedAt,
        enqueuedAt: requestedAt,
        completedAt: new Date("2026-07-21T00:01:00.000Z"),
        executionMetadata: { fetchedCount: 7 },
        idempotencyKey: "production-collection:real-scan-policy-1:scan-job-1",
      }),
      expect.objectContaining({
        id: "scan-job-2",
        sourceBindingId: "source-binding-1",
        scanPolicyId: "real-scan-policy-1",
        status: "failed",
        requestedAt,
        enqueuedAt: requestedAt,
        completedAt: new Date("2026-07-21T00:02:00.000Z"),
        failureReason: "provider retry exhausted",
        failureMetadata: { retryable: true },
        executionMetadata: { fetchedCount: 0 },
        idempotencyKey: "production-collection:real-scan-policy-1:scan-job-2",
      }),
    ]);
  });

  it("does not persist an active job when collection is interrupted", () => {
    const repository = new RecordingScanJobRepository();
    const reporter = new ProductionCollectionScanJobReporter(
      repository,
      new SequenceIdGenerator(["scan-job-1"]),
      new FixedClock(requestedAt),
    );

    reporter.beginAttempt({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: "source-binding-1",
      scanPolicyId: "real-scan-policy-1",
    });

    expect(repository.saved).toEqual([]);
  });

  it("rejects a completion reported from another workspace", async () => {
    const repository = new RecordingScanJobRepository();
    const reporter = new ProductionCollectionScanJobReporter(
      repository,
      new SequenceIdGenerator(["scan-job-1"]),
      new FixedClock(requestedAt),
    );
    const scanJobId = reporter.beginAttempt({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: "source-binding-1",
      scanPolicyId: "real-scan-policy-1",
    });

    await expect(
      reporter.reportSucceeded({
        tenantId: tenant,
        workspaceId: workspaceId("workspace-2"),
        scanJobId,
        completedAt: new Date("2026-07-21T00:01:00.000Z"),
      }),
    ).rejects.toThrow("scope mismatch");
    expect(repository.saved).toEqual([]);
  });
});

class SequenceIdGenerator implements IdGenerator {
  constructor(private readonly values: string[]) {}

  generate(): string {
    const value = this.values.shift();
    if (value === undefined) {
      throw new Error("Sequence ID generator exhausted");
    }
    return value;
  }
}

class RecordingScanJobRepository implements ScanJobRepositoryPort {
  readonly saved: ScanJob[] = [];

  async save(job: ScanJob): Promise<void> {
    this.saved.push(job);
  }

  async findById(): Promise<ScanJob | null> {
    return null;
  }

  async findActiveBySourceBinding(): Promise<ScanJob | null> {
    return null;
  }

  async findLatestBySourceBinding(): Promise<ScanJob | null> {
    return null;
  }

  async findByIdempotencyKey(): Promise<ScanJob | null> {
    return null;
  }
}
