import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { NotificationPreferenceManagementPort } from '../../ports';
import {
  isWorkspaceTelemetryConsent,
  writeWorkspaceTelemetryPreference,
} from '../shared/workspace-settings-preferences';
import type { UpdateWorkspaceTelemetryConsentCommand } from './update-workspace-telemetry-consent.command';
import type { UpdateWorkspaceTelemetryConsentResult } from './update-workspace-telemetry-consent.result';

type UpdateWorkspaceTelemetryConsentFailure = DomainError | Error;

export class UpdateWorkspaceTelemetryConsentUseCase {
  constructor(private readonly preferences: NotificationPreferenceManagementPort) {}

  async execute(
    command: UpdateWorkspaceTelemetryConsentCommand,
  ): Promise<Result<UpdateWorkspaceTelemetryConsentResult, UpdateWorkspaceTelemetryConsentFailure>> {
    const consent = command.consent.trim().toLowerCase();

    if (!isWorkspaceTelemetryConsent(consent)) {
      return err(new DomainError('validation.failed', 'Workspace telemetry consent is not supported', {
        consent: command.consent,
      }));
    }

    try {
      return ok({
        ...(await writeWorkspaceTelemetryPreference(this.preferences, command, consent)),
        updated: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Workspace telemetry consent update failed'));
    }
  }
}
