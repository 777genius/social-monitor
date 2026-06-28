import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  GetRecipientChannelNotificationPreferenceQuery,
  NotificationPreferenceManagementPort,
  RecipientChannelNotificationPreference,
  SetRecipientChannelNotificationPreferenceCommand,
} from '../../ports';
import { UpdateWorkspaceTelemetryConsentUseCase } from './update-workspace-telemetry-consent.use-case';

describe('UpdateWorkspaceTelemetryConsentUseCase', () => {
  it('selects telemetry consent and can clear it back to not configured', async () => {
    const preferences = new FakeNotificationPreferences();
    const useCase = new UpdateWorkspaceTelemetryConsentUseCase(preferences);

    await expect(useCase.execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      consent: 'enabled',
    })).resolves.toEqual({
      ok: true,
      value: {
        digestFrequency: 'weekly',
        telemetryConsent: 'enabled',
        updated: true,
      },
    });

    await expect(useCase.execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      consent: 'not_configured',
    })).resolves.toEqual({
      ok: true,
      value: {
        digestFrequency: 'weekly',
        telemetryConsent: 'not_configured',
        updated: true,
      },
    });
  });

  it('rejects unsupported telemetry consent values', async () => {
    await expect(new UpdateWorkspaceTelemetryConsentUseCase(new FakeNotificationPreferences()).execute({
      tenantId: tenantId('tenant-settings'),
      workspaceId: workspaceId('workspace-settings'),
      consent: 'maybe',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          consent: 'maybe',
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
