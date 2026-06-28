import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  GetRecipientChannelNotificationPreferenceQuery,
  NotificationPreferenceManagementPort,
  RecipientChannelNotificationPreference,
  SetRecipientChannelNotificationPreferenceCommand,
} from '../../ports';
import { UpdateWorkspaceDigestPreferenceUseCase } from './update-workspace-digest-preference.use-case';

describe('UpdateWorkspaceDigestPreferenceUseCase', () => {
  it('selects one digest frequency and clears the previous selection', async () => {
    const preferences = new FakeNotificationPreferences();
    const useCase = new UpdateWorkspaceDigestPreferenceUseCase(preferences);

    await useCase.execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      frequency: 'daily',
    });

    await expect(useCase.execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      frequency: 'off',
    })).resolves.toEqual({
      ok: true,
      value: {
        digestFrequency: 'off',
        telemetryConsent: 'not_configured',
        updated: true,
      },
    });

    await expect(preferences.getRecipientChannelPreference({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      recipientKey: 'workspace-settings.digest.daily',
      channel: 'in_app',
    })).resolves.toBeNull();
  });

  it('rejects unsupported digest frequencies', async () => {
    await expect(new UpdateWorkspaceDigestPreferenceUseCase(new FakeNotificationPreferences()).execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      frequency: 'monthly',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          frequency: 'monthly',
        },
      }),
    });
  });
});

class FakeNotificationPreferences implements NotificationPreferenceManagementPort {
  private readonly preferences = new Map<string, RecipientChannelNotificationPreference>();

  async setRecipientChannelPreference(
    command: SetRecipientChannelNotificationPreferenceCommand,
  ): Promise<RecipientChannelNotificationPreference> {
    const preference: RecipientChannelNotificationPreference = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recipientKey: command.recipientKey,
      channel: command.channel,
      allowed: command.allowed,
      reason: command.allowed ? undefined : command.reason,
    };

    if (command.allowed) {
      this.preferences.delete(this.key(command));
    } else {
      this.preferences.set(this.key(command), preference);
    }

    return preference;
  }

  async getRecipientChannelPreference(
    query: GetRecipientChannelNotificationPreferenceQuery,
  ): Promise<RecipientChannelNotificationPreference | null> {
    return this.preferences.get(this.key(query)) ?? null;
  }

  private key(params: GetRecipientChannelNotificationPreferenceQuery): string {
    return `${params.tenantId}:${params.workspaceId}:${params.recipientKey}:${params.channel}`;
  }
}
