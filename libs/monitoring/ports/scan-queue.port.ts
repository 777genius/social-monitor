import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type EnqueuedScanSourceQueryMode = 'search' | 'listing' | 'account_feed' | 'thread' | 'url';

export type EnqueuedScanSourceQuery = {
  readonly mode: EnqueuedScanSourceQueryMode;
  readonly query: string;
};

export type EnqueueScanCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: string;
  readonly sourceQuery: EnqueuedScanSourceQuery;
  readonly correlationId: string;
  readonly causationId: string;
};

export interface ScanQueuePort {
  canAccept(command: EnqueueScanCommand): Promise<boolean>;
  enqueue(command: EnqueueScanCommand): Promise<void>;
}
