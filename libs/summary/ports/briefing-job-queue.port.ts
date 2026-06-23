import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type EnqueueBriefingJobCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly briefingJobId: string;
  readonly correlationId: string;
  readonly causationId: string;
};

export interface BriefingJobQueuePort {
  canAccept(command: EnqueueBriefingJobCommand): Promise<boolean>;
  enqueue(command: EnqueueBriefingJobCommand): Promise<void>;
}
