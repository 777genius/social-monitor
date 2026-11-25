import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from '../../domain';
import type {
  NotificationPreferenceManagementPort,
  RecipientChannelNotificationPreference,
} from '../../ports';

export const digestFrequencyValues = ['off', 'daily', 'weekly'] as const;
export const telemetryConsentValues = ['enabled', 'disabled', 'not_configured'] as const;

export type WorkspaceDigestFrequency = typeof digestFrequencyValues[number];
export type WorkspaceTelemetryConsent = typeof telemetryConsentValues[number];

export type WorkspaceSettingsPreferenceView = {
  readonly digestFrequency: WorkspaceDigestFrequency;
  readonly telemetryConsent: WorkspaceTelemetryConsent;
};

type WorkspaceSettingsScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
};

type PreferenceDefinition<TValue extends string> = {
  readonly value: TValue;
  readonly recipientKey: string;
};

const settingsChannel: DeliveryChannel = 'in_app';
const selectedValueReason = 'workspace_setting_value';

const digestPreferenceDefinitions: readonly PreferenceDefinition<WorkspaceDigestFrequency>[] = [
  { value: 'off', recipientKey: 'workspace-settings.digest.off' },
  { value: 'daily', recipientKey: 'workspace-settings.digest.daily' },
  { value: 'weekly', recipientKey: 'workspace-settings.digest.weekly' },
];

const telemetryPreferenceDefinitions: readonly PreferenceDefinition<Exclude<WorkspaceTelemetryConsent, 'not_configured'>>[] = [
  { value: 'enabled', recipientKey: 'workspace-settings.telemetry.enabled' },
  { value: 'disabled', recipientKey: 'workspace-settings.telemetry.disabled' },
];

export const readWorkspaceSettingsPreferences = async (
  preferences: NotificationPreferenceManagementPort,
  scope: WorkspaceSettingsScope,
): Promise<WorkspaceSettingsPreferenceView> => ({
  digestFrequency: await readSelectedPreference({
    preferences,
    scope,
    definitions: digestPreferenceDefinitions,
    fallback: 'weekly',
  }),
  telemetryConsent: await readSelectedPreference({
    preferences,
    scope,
    definitions: telemetryPreferenceDefinitions,
    fallback: 'not_configured',
  }),
});

export const writeWorkspaceDigestPreference = async (
  preferences: NotificationPreferenceManagementPort,
  scope: WorkspaceSettingsScope,
  frequency: WorkspaceDigestFrequency,
): Promise<WorkspaceSettingsPreferenceView> => {
  await writeSelectedPreference({
    preferences,
    scope,
    definitions: digestPreferenceDefinitions,
    selectedValue: frequency,
  });

  return readWorkspaceSettingsPreferences(preferences, scope);
};

export const writeWorkspaceTelemetryPreference = async (
  preferences: NotificationPreferenceManagementPort,
  scope: WorkspaceSettingsScope,
  consent: WorkspaceTelemetryConsent,
): Promise<WorkspaceSettingsPreferenceView> => {
  await writeSelectedPreference({
    preferences,
    scope,
    definitions: telemetryPreferenceDefinitions,
    selectedValue: consent === 'not_configured' ? null : consent,
  });

  return readWorkspaceSettingsPreferences(preferences, scope);
};

export const isWorkspaceDigestFrequency = (value: string): value is WorkspaceDigestFrequency =>
  (digestFrequencyValues as readonly string[]).includes(value);

export const isWorkspaceTelemetryConsent = (value: string): value is WorkspaceTelemetryConsent =>
  (telemetryConsentValues as readonly string[]).includes(value);

const readSelectedPreference = async <TValue extends string>(params: {
  readonly preferences: NotificationPreferenceManagementPort;
  readonly scope: WorkspaceSettingsScope;
  readonly definitions: readonly PreferenceDefinition<TValue>[];
  readonly fallback: TValue;
}): Promise<TValue> => {
  for (const definition of params.definitions) {
    const preference = await params.preferences.getRecipientChannelPreference({
      tenantId: params.scope.tenantId,
      workspaceId: params.scope.workspaceId,
      recipientKey: definition.recipientKey,
      channel: settingsChannel,
    });

    if (isSelectedPreference(preference)) {
      return definition.value;
    }
  }

  return params.fallback;
};

const writeSelectedPreference = async <TValue extends string>(params: {
  readonly preferences: NotificationPreferenceManagementPort;
  readonly scope: WorkspaceSettingsScope;
  readonly definitions: readonly PreferenceDefinition<TValue>[];
  readonly selectedValue: TValue | null;
}): Promise<void> => {
  for (const definition of params.definitions) {
    await params.preferences.setRecipientChannelPreference({
      tenantId: params.scope.tenantId,
      workspaceId: params.scope.workspaceId,
      recipientKey: definition.recipientKey,
      channel: settingsChannel,
      allowed: true,
    });
  }

  const selectedDefinition = params.definitions.find((definition) => definition.value === params.selectedValue);

  if (selectedDefinition === undefined) {
    return;
  }

  await params.preferences.setRecipientChannelPreference({
    tenantId: params.scope.tenantId,
    workspaceId: params.scope.workspaceId,
    recipientKey: selectedDefinition.recipientKey,
    channel: settingsChannel,
    allowed: false,
    reason: selectedValueReason,
  });
};

const isSelectedPreference = (
  preference: RecipientChannelNotificationPreference | null,
): boolean => preference !== null && preference.allowed === false;
