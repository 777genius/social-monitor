import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryNotificationPreferenceReader } from '../../adapters/preferences/in-memory-notification-preference.reader';
import { type DeliveryChannel } from '../../domain';
import { SetNotificationPreferenceUseCase } from './set-notification-preference.use-case';

describe('SetNotificationPreferenceUseCase', () => {
  it('suppresses recipient/channel delivery with a durable reason', async () => {
    const preferences = new InMemoryNotificationPreferenceReader();
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
    const preferences = new InMemoryNotificationPreferenceReader();
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
    await expect(new SetNotificationPreferenceUseCase(new InMemoryNotificationPreferenceReader()).execute({
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

    await expect(new SetNotificationPreferenceUseCase(new InMemoryNotificationPreferenceReader()).execute({
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
