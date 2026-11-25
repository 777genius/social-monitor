import type { NotificationPreferenceView } from '../shared/notification-preference-presenter';

export type SetNotificationPreferenceResult = {
  readonly preference: NotificationPreferenceView;
  readonly updated: true;
};
