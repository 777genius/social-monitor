import { err, ok, type Result } from '@social-monitor/shared-kernel';

import type { NotificationPreferenceManagementPort } from '../../ports';
import { readWorkspaceSettingsPreferences } from '../shared/workspace-settings-preferences';
import type { GetWorkspaceSettingsQuery } from './get-workspace-settings.query';
import type { GetWorkspaceSettingsResult } from './get-workspace-settings.result';

export class GetWorkspaceSettingsUseCase {
  constructor(private readonly preferences: NotificationPreferenceManagementPort) {}

  async execute(query: GetWorkspaceSettingsQuery): Promise<Result<GetWorkspaceSettingsResult, Error>> {
    try {
      return ok(await readWorkspaceSettingsPreferences(this.preferences, query));
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Workspace settings read failed'));
    }
  }
}
