import type {
  JsonObject,
  TenantId,
  WorkspaceId,
} from "@social-monitor/shared-kernel";

export type ReportScanSucceededCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly completedAt: Date;
  readonly warnings?: readonly string[];
  readonly collectionTelemetry?: JsonObject;
};

export type ReportScanFailedCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly completedAt: Date;
  readonly failureReason: string;
  readonly failureMetadata?: JsonObject;
  readonly collectionTelemetry?: JsonObject;
};

export interface ScanExecutionReporterPort {
  reportSucceeded(command: ReportScanSucceededCommand): Promise<void>;
  reportFailed(command: ReportScanFailedCommand): Promise<void>;
}
