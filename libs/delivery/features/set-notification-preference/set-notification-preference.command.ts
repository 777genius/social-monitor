import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from '../../domain';

export type SetNotificationPreferenceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
  readonly allowed: boolean;
  readonly reason?: string;
};
