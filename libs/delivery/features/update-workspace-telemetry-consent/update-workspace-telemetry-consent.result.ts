import type { WorkspaceSettingsPreferenceView } from '../shared/workspace-settings-preferences';

export type UpdateWorkspaceTelemetryConsentResult = WorkspaceSettingsPreferenceView & {
  readonly updated: true;
};
