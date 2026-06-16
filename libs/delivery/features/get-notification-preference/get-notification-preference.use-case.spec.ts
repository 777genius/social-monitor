import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { type DeliveryChannel } from '../../domain';
import type {
  GetRecipientChannelNotificationPreferenceQuery,
  NotificationPreferenceManagementPort,
  RecipientChannelNotificationPreference,
  SetRecipientChannelNotificationPreferenceCommand,
} from '../../ports';
import { GetNotificationPreferenceUseCase } from './get-notification-preference.use-case';

describe('GetNotificationPreferenceUseCase', () => {
  it('returns explicit suppression preference for a recipient/channel', async () => {
    const preferences = new FakeNotificationPreferenceManagement();
    preferences.suppressRecipientChannel({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      reason: 'User disabled email notifications',
    });

    await expect(new GetNotificationPreferenceUseCase(preferences).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
    })).resolves.toEqual({
      ok: true,
      value: {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        recipientKey: 'user-1',
        channel: 'email',
        allowed: false,
        reason: 'User disabled email notifications',
      },
    });
  });

  it('returns default allowed preference when no explicit record exists', async () => {
    await expect(new GetNotificationPreferenceUseCase(new FakeNotificationPreferenceManagement()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'in_app',
    })).resolves.toEqual({
      ok: true,
      value: {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        recipientKey: 'user-1',
        channel: 'in_app',
        allowed: true,
      },
    });
  });

  it('rejects blank recipient keys and unsupported channels', async () => {
    await expect(new GetNotificationPreferenceUseCase(new FakeNotificationPreferenceManagement()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: ' ',
      channel: 'email',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });

    await expect(new GetNotificationPreferenceUseCase(new FakeNotificationPreferenceManagement()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'sms' as DeliveryChannel,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          channel: 'sms',
        },
      }),
    });
  });
});

class FakeNotificationPreferenceManagement implements NotificationPreferenceManagementPort {
  private readonly preferences = new Map<string, RecipientChannelNotificationPreference>();

  suppressRecipientChannel(command: Omit<SetRecipientChannelNotificationPreferenceCommand, 'allowed'>): void {
    void this.setRecipientChannelPreference({
      ...command,
      allowed: false,
    });
  }

  async setRecipientChannelPreference(
    command: SetRecipientChannelNotificationPreferenceCommand,
  ): Promise<RecipientChannelNotificationPreference> {
    const preference: RecipientChannelNotificationPreference = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recipientKey: command.recipientKey.trim(),
      channel: command.channel,
      allowed: command.allowed,
      reason: command.allowed ? undefined : command.reason?.trim(),
    };

    this.preferences.set(this.key(preference), preference);

    return preference;
  }

  async getRecipientChannelPreference(
    query: GetRecipientChannelNotificationPreferenceQuery,
  ): Promise<RecipientChannelNotificationPreference | null> {
    return this.preferences.get(this.key(query)) ?? null;
  }

  private key(params: GetRecipientChannelNotificationPreferenceQuery): string {
    return `${params.tenantId}:${params.workspaceId}:${params.recipientKey.trim()}:${params.channel}`;
  }
}
