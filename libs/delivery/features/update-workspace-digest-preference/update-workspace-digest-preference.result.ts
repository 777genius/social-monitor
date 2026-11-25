import type { WorkspaceSettingsPreferenceView } from '../shared/workspace-settings-preferences';

export type UpdateWorkspaceDigestPreferenceResult = WorkspaceSettingsPreferenceView & {
  readonly updated: true;
};
