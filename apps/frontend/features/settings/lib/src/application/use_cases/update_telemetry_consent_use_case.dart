import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/workspace_settings.dart';
import '../../domain/value_objects/telemetry_consent_state.dart';
import '../commands/update_telemetry_consent_command.dart';
import '../contracts/workspace_settings_catalog.dart';

final class UpdateTelemetryConsentUseCase {
  const UpdateTelemetryConsentUseCase(this._catalog);

  final WorkspaceSettingsCatalog _catalog;

  Future<Result<WorkspaceSettings>> call(
    UpdateTelemetryConsentCommand command,
  ) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'settings.workspace_scope_required',
          ),
        ),
      );
    }
    if (command.consent == TelemetryConsentState.unknown) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Choose a valid telemetry consent state',
            code: 'settings.telemetry_consent_invalid',
            field: 'consent',
          ),
        ),
      );
    }
    return _catalog.updateTelemetryConsent(command);
  }
}
