import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptState } from '../../domain';

export type RecordDeliveryAttemptStateCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryAttemptId: string;
  readonly nextState: Exclude<DeliveryAttemptState, 'queued'>;
  readonly reason?: string;
};
