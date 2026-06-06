import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryContent } from '../../ports';

export type RetryDeliveryAttemptCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryAttemptId: string;
  readonly content: DeliveryContent;
};
