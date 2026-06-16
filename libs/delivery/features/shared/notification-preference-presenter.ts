import type { RecipientChannelNotificationPreference } from '../../ports';

export type NotificationPreferenceView = RecipientChannelNotificationPreference;

export const presentNotificationPreference = (
  preference: RecipientChannelNotificationPreference,
): NotificationPreferenceView => preference;
