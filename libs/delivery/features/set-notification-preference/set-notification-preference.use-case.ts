import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import { type DeliveryChannel } from '../../domain';
import type { NotificationPreferenceManagementPort } from '../../ports';
import { presentNotificationPreference } from '../shared/notification-preference-presenter';
import type { SetNotificationPreferenceCommand } from './set-notification-preference.command';
import type { SetNotificationPreferenceResult } from './set-notification-preference.result';

type SetNotificationPreferenceFailure = DomainError | Error;

const deliveryChannels = new Set<DeliveryChannel>(['in_app', 'email', 'webhook']);

export class SetNotificationPreferenceUseCase {
  constructor(private readonly preferences: NotificationPreferenceManagementPort) {}

  async execute(
    command: SetNotificationPreferenceCommand,
  ): Promise<Result<SetNotificationPreferenceResult, SetNotificationPreferenceFailure>> {
    const validation = validate(command);

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

const validate = (command: SetNotificationPreferenceCommand): DomainError | null => {
  if (command.recipientKey.trim().length === 0) {
    return new DomainError('validation.failed', 'Notification preference recipientKey must be non-empty');
  }

  if (!deliveryChannels.has(command.channel)) {
    return new DomainError('validation.failed', 'Notification preference channel is not supported', {
      channel: command.channel,
    });
  }

  if (!command.allowed && (command.reason ?? '').trim().length === 0) {
    return new DomainError('validation.failed', 'Notification preference suppression reason must be non-empty');
  }

  return null;
};
