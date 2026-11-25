import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { NotificationPreferenceManagementPort } from '../../ports';
import {
  isWorkspaceDigestFrequency,
  writeWorkspaceDigestPreference,
} from '../shared/workspace-settings-preferences';
import type { UpdateWorkspaceDigestPreferenceCommand } from './update-workspace-digest-preference.command';
import type { UpdateWorkspaceDigestPreferenceResult } from './update-workspace-digest-preference.result';

type UpdateWorkspaceDigestPreferenceFailure = DomainError | Error;

export class UpdateWorkspaceDigestPreferenceUseCase {
  constructor(private readonly preferences: NotificationPreferenceManagementPort) {}

  async execute(
    command: UpdateWorkspaceDigestPreferenceCommand,
  ): Promise<Result<UpdateWorkspaceDigestPreferenceResult, UpdateWorkspaceDigestPreferenceFailure>> {
    const frequency = command.frequency.trim().toLowerCase();

    if (!isWorkspaceDigestFrequency(frequency)) {
      return err(new DomainError('validation.failed', 'Workspace digest frequency is not supported', {
        frequency: command.frequency,
      }));
    }

    try {
      return ok({
        ...(await writeWorkspaceDigestPreference(this.preferences, command, frequency)),
        updated: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Workspace digest preference update failed'));
    }
  }
}
