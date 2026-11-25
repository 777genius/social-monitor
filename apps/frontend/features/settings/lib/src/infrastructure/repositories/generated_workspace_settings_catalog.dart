import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/update_digest_preference_command.dart';
import '../../application/commands/update_telemetry_consent_command.dart';
import '../../application/contracts/workspace_settings_catalog.dart';
import '../../application/queries/load_workspace_settings_query.dart';
import '../../domain/entities/workspace_settings.dart';
import '../api/workspace_settings_api_dto.dart';
import '../api_clients/in_memory_workspace_settings_api_client.dart';
import '../mappers/workspace_settings_mapper.dart';

final class GeneratedWorkspaceSettingsCatalog
    implements WorkspaceSettingsCatalog {
  const GeneratedWorkspaceSettingsCatalog({
    required WorkspaceSettingsApiClient apiClient,
    WorkspaceSettingsMapper mapper = const WorkspaceSettingsMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final WorkspaceSettingsApiClient _apiClient;
  final WorkspaceSettingsMapper _mapper;

  @override
  Future<Result<WorkspaceSettings>> loadSettings(
    LoadWorkspaceSettingsQuery query,
  ) async {
    final result = await _apiClient.loadSettings(
      LoadWorkspaceSettingsApiRequest.fromQuery(query),
    );
    return _mapSettings(result);
  }

  @override
  Future<Result<WorkspaceSettings>> updateDigestPreference(
    UpdateDigestPreferenceCommand command,
  ) async {
    final result = await _apiClient.updateDigestPreference(
      UpdateDigestPreferenceApiRequest.fromCommand(command),
    );
    return _mapSettings(result);
  }

  @override
  Future<Result<WorkspaceSettings>> updateTelemetryConsent(
    UpdateTelemetryConsentCommand command,
  ) async {
    final result = await _apiClient.updateTelemetryConsent(
      UpdateTelemetryConsentApiRequest.fromCommand(command),
    );
    return _mapSettings(result);
  }

  Result<WorkspaceSettings> _mapSettings(
    Result<WorkspaceSettingsApiDto> result,
  ) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<WorkspaceSettings>.failure,
    );
  }
}
