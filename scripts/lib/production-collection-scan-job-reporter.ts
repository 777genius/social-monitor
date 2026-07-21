import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
} from "@social-monitor/ingestion/ports";
import { ScanJob } from "@social-monitor/monitoring/domain";
import type { ScanJobRepositoryPort } from "@social-monitor/monitoring/ports";
import type {
  Clock,
  IdGenerator,
  TenantId,
  WorkspaceId,
} from "@social-monitor/shared-kernel";

export class ProductionCollectionScanJobReporter implements ScanExecutionReporterPort {
  private readonly pendingScans = new Map<
    string,
    {
      readonly tenantId: TenantId;
      readonly workspaceId: WorkspaceId;
      readonly sourceBindingId: string;
      readonly scanPolicyId: string;
      readonly requestedAt: Date;
    }
  >();

  constructor(
    private readonly scanJobs: ScanJobRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  beginAttempt(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceBindingId: string;
    readonly scanPolicyId: string;
  }): string {
    const scanJobId = this.ids.generate();
    this.pendingScans.set(scanJobId, {
      ...params,
      requestedAt: this.clock.now(),
    });
    return scanJobId;
  }

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    const job = this.completedJob(command).markSucceeded({
      completedAt: command.completedAt,
      executionMetadata: command.collectionTelemetry,
    });
    await this.scanJobs.save(job);
    this.pendingScans.delete(command.scanJobId);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    const job = this.completedJob(command).markFailed({
      completedAt: command.completedAt,
      failureReason: command.failureReason,
      failureMetadata: command.failureMetadata,
      executionMetadata: command.collectionTelemetry,
    });
    await this.scanJobs.save(job);
    this.pendingScans.delete(command.scanJobId);
  }

  private completedJob(
    command: ReportScanSucceededCommand | ReportScanFailedCommand,
  ): ScanJob {
    const pending = this.pendingScans.get(command.scanJobId);
    if (pending === undefined) {
      throw new Error(
        `Production collection scan job is not pending: ${command.scanJobId}`,
      );
    }
    if (
      pending.tenantId !== command.tenantId ||
      pending.workspaceId !== command.workspaceId
    ) {
      throw new Error(
        `Production collection scan job scope mismatch: ${command.scanJobId}`,
      );
    }

    return ScanJob.request({
      id: command.scanJobId,
      tenantId: pending.tenantId,
      workspaceId: pending.workspaceId,
      sourceBindingId: pending.sourceBindingId,
      scanPolicyId: pending.scanPolicyId,
      idempotencyKey: `production-collection:${pending.scanPolicyId}:${command.scanJobId}`,
      requestedAt: pending.requestedAt,
    }).markEnqueued({ enqueuedAt: pending.requestedAt });
  }
}
