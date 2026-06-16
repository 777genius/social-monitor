import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryNotificationPreferenceReader } from '../../adapters/preferences/in-memory-notification-preference.reader';
import { type DeliveryChannel } from '../../domain';
import { GetNotificationPreferenceUseCase } from './get-notification-preference.use-case';

describe('GetNotificationPreferenceUseCase', () => {
  it('returns explicit suppression preference for a recipient/channel', async () => {
    const preferences = new InMemoryNotificationPreferenceReader();
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
    await expect(new GetNotificationPreferenceUseCase(new InMemoryNotificationPreferenceReader()).execute({
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
    await expect(new GetNotificationPreferenceUseCase(new InMemoryNotificationPreferenceReader()).execute({
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

    await expect(new GetNotificationPreferenceUseCase(new InMemoryNotificationPreferenceReader()).execute({
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
