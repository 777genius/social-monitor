import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { NotificationPreferenceManagementPort } from '../../ports';
import {
  allDeliveryChannels,
  type DeliveryChannelPolicy,
  isDeliveryChannelSupported,
} from '../../domain';
import { presentNotificationPreference } from '../shared/notification-preference-presenter';
import type { SetNotificationPreferenceCommand } from './set-notification-preference.command';
import type { SetNotificationPreferenceResult } from './set-notification-preference.result';

type SetNotificationPreferenceFailure = DomainError | Error;

export class SetNotificationPreferenceUseCase {
  constructor(
    private readonly preferences: NotificationPreferenceManagementPort,
    private readonly supportedChannels: DeliveryChannelPolicy = allDeliveryChannels,
  ) {}

  async execute(
    command: SetNotificationPreferenceCommand,
  ): Promise<Result<SetNotificationPreferenceResult, SetNotificationPreferenceFailure>> {
    const validation = validate(command, this.supportedChannels);

    if (validation !== null) {
      return err(validation);
    }

    try {
      const preference = await this.preferences.setRecipientChannelPreference({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        recipientKey: command.recipientKey.trim(),
        channel: command.channel,
        allowed: command.allowed,
        reason: command.allowed ? undefined : command.reason?.trim(),
      });

      return ok({
        preference: presentNotificationPreference(preference),
        updated: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Notification preference update failed'));
    }
  }
}

const validate = (
  command: SetNotificationPreferenceCommand,
  supportedChannels: DeliveryChannelPolicy,
): DomainError | null => {
  if (command.recipientKey.trim().length === 0) {
    return new DomainError('validation.failed', 'Notification preference recipientKey must be non-empty');
  }

  if (!isDeliveryChannelSupported(command.channel, supportedChannels)) {
    return new DomainError('validation.failed', 'Notification preference channel is not supported', {
      channel: command.channel,
      supportedChannels,
    });
  }

  if (!command.allowed && (command.reason ?? '').trim().length === 0) {
    return new DomainError('validation.failed', 'Notification preference suppression reason must be non-empty');
  }

  return null;
};
