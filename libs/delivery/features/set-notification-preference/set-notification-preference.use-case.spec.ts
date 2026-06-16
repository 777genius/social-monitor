import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { type DeliveryChannel } from '../../domain';
import type {
  DeliveryPreferenceDecision,
  DeliveryPreferenceQuery,
  GetRecipientChannelNotificationPreferenceQuery,
  NotificationPreferenceManagementPort,
  RecipientChannelNotificationPreference,
  SetRecipientChannelNotificationPreferenceCommand,
} from '../../ports';
import { SetNotificationPreferenceUseCase } from './set-notification-preference.use-case';

describe('SetNotificationPreferenceUseCase', () => {
  it('suppresses recipient/channel delivery with a durable reason', async () => {
    const preferences = new FakeNotificationPreferenceManagement();
    const result = await new SetNotificationPreferenceUseCase(preferences).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      allowed: false,
      reason: 'User disabled email notifications',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        updated: true,
        preference: {
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          recipientKey: 'user-1',
          channel: 'email',
          allowed: false,
          reason: 'User disabled email notifications',
        },
      },
    });
    await expect(preferences.getDeliveryPreference({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      resourceType: 'digest',
      resourceId: 'digest-1',
    })).resolves.toEqual({
      allowed: false,
      reason: 'User disabled email notifications',
    });
  });

  it('allows recipient/channel delivery by clearing suppression', async () => {
    const preferences = new FakeNotificationPreferenceManagement();
    preferences.suppressRecipientChannel({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      reason: 'User disabled email notifications',
    });

    const result = await new SetNotificationPreferenceUseCase(preferences).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      allowed: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        updated: true,
        preference: {
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          recipientKey: 'user-1',
          channel: 'email',
          allowed: true,
        },
      },
    });
    await expect(preferences.getDeliveryPreference({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      resourceType: 'digest',
      resourceId: 'digest-1',
    })).resolves.toEqual({ allowed: true });
  });

  it('rejects unsupported channels and missing suppression reasons', async () => {
    await expect(new SetNotificationPreferenceUseCase(new FakeNotificationPreferenceManagement()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'sms' as DeliveryChannel,
      allowed: true,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          channel: 'sms',
        },
      }),
    });

    await expect(new SetNotificationPreferenceUseCase(new FakeNotificationPreferenceManagement()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      recipientKey: 'user-1',
      channel: 'email',
      allowed: false,
      reason: ' ',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
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

  async getDeliveryPreference(query: DeliveryPreferenceQuery): Promise<DeliveryPreferenceDecision> {
    const preference = await this.getRecipientChannelPreference(query);

    if (preference === null || preference.allowed) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: preference.reason ?? 'Delivery suppressed by recipient preference',
    };
  }

  private key(params: GetRecipientChannelNotificationPreferenceQuery): string {
    return `${params.tenantId}:${params.workspaceId}:${params.recipientKey.trim()}:${params.channel}`;
  }
}
