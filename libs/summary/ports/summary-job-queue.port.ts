import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type EnqueueSummaryJobCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryJobId: string;
  readonly correlationId: string;
  readonly causationId: string;
};

export interface SummaryJobQueuePort {
  canAccept(command: EnqueueSummaryJobCommand): Promise<boolean>;
  enqueue(command: EnqueueSummaryJobCommand): Promise<void>;
}
