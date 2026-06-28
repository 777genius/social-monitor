import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type UpdateWorkspaceTelemetryConsentCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly consent: string;
};
