import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/workspace_settings.dart';
import '../commands/update_digest_preference_command.dart';
import '../commands/update_telemetry_consent_command.dart';
import '../queries/load_workspace_settings_query.dart';

abstract interface class WorkspaceSettingsCatalog {
  Future<Result<WorkspaceSettings>> loadSettings(
    LoadWorkspaceSettingsQuery query,
  );

  Future<Result<WorkspaceSettings>> updateDigestPreference(
    UpdateDigestPreferenceCommand command,
  );

  Future<Result<WorkspaceSettings>> updateTelemetryConsent(
    UpdateTelemetryConsentCommand command,
  );
}
