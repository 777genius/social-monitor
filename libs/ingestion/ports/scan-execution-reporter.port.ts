import type { JsonObject, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ReportScanSucceededCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly completedAt: Date;
  readonly warnings?: readonly string[];
};

export type ReportScanFailedCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly completedAt: Date;
  readonly failureReason: string;
  readonly failureMetadata?: JsonObject;
};

export interface ScanExecutionReporterPort {
  reportSucceeded(command: ReportScanSucceededCommand): Promise<void>;
  reportFailed(command: ReportScanFailedCommand): Promise<void>;
}
