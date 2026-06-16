import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryContent } from './delivery-provider.port';

export type EnqueueDeliveryAttemptDispatchQueueCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryAttemptId: string;
  readonly content: DeliveryContent;
  readonly commandId: string;
  readonly correlationId: string;
  readonly causationId?: string;
};

export interface DeliveryAttemptDispatchQueuePort {
  canAccept(command: EnqueueDeliveryAttemptDispatchQueueCommand): Promise<boolean>;
  enqueue(command: EnqueueDeliveryAttemptDispatchQueueCommand): Promise<void>;
}
