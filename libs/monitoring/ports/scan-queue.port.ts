import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type EnqueueScanCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly correlationId: string;
  readonly causationId: string;
};

export interface ScanQueuePort {
  canAccept(command: EnqueueScanCommand): Promise<boolean>;
  enqueue(command: EnqueueScanCommand): Promise<void>;
}
