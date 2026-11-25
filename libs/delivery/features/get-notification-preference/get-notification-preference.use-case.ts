import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import { type DeliveryChannel } from '../../domain';
import type { NotificationPreferenceManagementPort } from '../../ports';
import { presentNotificationPreference } from '../shared/notification-preference-presenter';
import type { GetNotificationPreferenceQuery } from './get-notification-preference.query';
import type { GetNotificationPreferenceResult } from './get-notification-preference.result';

type GetNotificationPreferenceFailure = DomainError;

const deliveryChannels = new Set<DeliveryChannel>(['in_app', 'email', 'webhook']);

export class GetNotificationPreferenceUseCase {
  constructor(private readonly preferences: NotificationPreferenceManagementPort) {}

  async execute(
    query: GetNotificationPreferenceQuery,
  ): Promise<Result<GetNotificationPreferenceResult, GetNotificationPreferenceFailure>> {
    const validation = validate(query);

    if (validation !== null) {
      return err(validation);
    }

    const preference = await this.preferences.getRecipientChannelPreference({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      recipientKey: query.recipientKey.trim(),
      channel: query.channel,
    });

    return ok(presentNotificationPreference(preference ?? {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      recipientKey: query.recipientKey.trim(),
      channel: query.channel,
      allowed: true,
    }));
  }
}

const validate = (query: GetNotificationPreferenceQuery): DomainError | null => {
  if (query.recipientKey.trim().length === 0) {
    return new DomainError('validation.failed', 'Notification preference recipientKey must be non-empty');
  }

  if (!deliveryChannels.has(query.channel)) {
    return new DomainError('validation.failed', 'Notification preference channel is not supported', {
      channel: query.channel,
    });
  }

  return null;
};
