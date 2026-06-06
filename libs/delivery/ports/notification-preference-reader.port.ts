import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel, DeliveryAttemptProps } from '../domain';

export type DeliveryPreferenceQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly channel: DeliveryChannel;
  readonly recipientKey: string;
  readonly resourceType: DeliveryAttemptProps['resourceType'];
  readonly resourceId: string;
};

export type DeliveryPreferenceDecision =
  | {
      readonly allowed: true;
    }
  | {
      readonly allowed: false;
      readonly reason: string;
    };

export interface NotificationPreferenceReaderPort {
  getDeliveryPreference(query: DeliveryPreferenceQuery): Promise<DeliveryPreferenceDecision>;
}
