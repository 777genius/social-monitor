import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type SchedulePeriodicReaderSummariesCommand = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly now: Date;
  readonly limit: number;
  readonly correlationId: string;
};
