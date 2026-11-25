import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from '../domain';

export type RecipientChannelNotificationPreference = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
  readonly allowed: boolean;
  readonly reason?: string;
};

export type SetRecipientChannelNotificationPreferenceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
  readonly allowed: boolean;
  readonly reason?: string;
};

export type GetRecipientChannelNotificationPreferenceQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
};

export interface NotificationPreferenceManagementPort {
  setRecipientChannelPreference(
    command: SetRecipientChannelNotificationPreferenceCommand,
  ): Promise<RecipientChannelNotificationPreference>;
  getRecipientChannelPreference(
    query: GetRecipientChannelNotificationPreferenceQuery,
  ): Promise<RecipientChannelNotificationPreference | null>;
}
