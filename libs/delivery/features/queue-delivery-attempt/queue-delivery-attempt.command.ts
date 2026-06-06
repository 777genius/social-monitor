import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from '../../domain';

export type QueueDeliveryAttemptCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: string;
  readonly channel: DeliveryChannel;
  readonly recipientKey: string;
  readonly resourceType: 'summary' | 'digest' | 'scan' | 'feed';
  readonly resourceId: string;
  readonly maxRetries?: number;
};
