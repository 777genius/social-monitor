import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  GetRecipientChannelNotificationPreferenceQuery,
  NotificationPreferenceManagementPort,
  RecipientChannelNotificationPreference,
  SetRecipientChannelNotificationPreferenceCommand,
} from '../../ports';
import { GetWorkspaceSettingsUseCase } from './get-workspace-settings.use-case';

describe('GetWorkspaceSettingsUseCase', () => {
  it('returns safe defaults when no workspace preferences were selected', async () => {
    await expect(new GetWorkspaceSettingsUseCase(new FakeNotificationPreferences()).execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
    })).resolves.toEqual({
      ok: true,
      value: {
        digestFrequency: 'weekly',
        telemetryConsent: 'not_configured',
      },
    });
  });

  it('reads selected values from internal workspace preference keys', async () => {
    const preferences = new FakeNotificationPreferences();
    await preferences.setRecipientChannelPreference({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      recipientKey: 'workspace-settings.digest.daily',
      channel: 'in_app',
      allowed: false,
      reason: 'workspace_setting_value',
    });
    await preferences.setRecipientChannelPreference({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      recipientKey: 'workspace-settings.telemetry.enabled',
      channel: 'in_app',
      allowed: false,
      reason: 'workspace_setting_value',
    });

    await expect(new GetWorkspaceSettingsUseCase(preferences).execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
    })).resolves.toEqual({
      ok: true,
      value: {
        digestFrequency: 'daily',
        telemetryConsent: 'enabled',
      },
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
