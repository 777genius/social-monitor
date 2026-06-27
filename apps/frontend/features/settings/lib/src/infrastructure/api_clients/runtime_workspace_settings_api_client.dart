import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/workspace_settings_api_dto.dart';
import 'in_memory_workspace_settings_api_client.dart';

final class RuntimeWorkspaceSettingsApiClient
    implements WorkspaceSettingsApiClient {
  const RuntimeWorkspaceSettingsApiClient({required this.settings});

  final WorkspaceSettingsApiDto settings;

  @override
  Future<Result<WorkspaceSettingsApiDto>> loadSettings(
    LoadWorkspaceSettingsApiRequest request,
  ) async {
    final failure = _failureFor(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    return Result.success(settings);
  }

  @override
  Future<Result<WorkspaceSettingsApiDto>> updateDigestPreference(
    UpdateDigestPreferenceApiRequest request,
  ) async {
    final failure = _failureFor(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    return Result.failure(_mutationUnavailableFailure());
  }

  @override
  Future<Result<WorkspaceSettingsApiDto>> updateTelemetryConsent(
    UpdateTelemetryConsentApiRequest request,
  ) async {
    final failure = _failureFor(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    return Result.failure(_mutationUnavailableFailure());
  }

  AppFailure? _failureFor(WorkspaceScope scope) {
    if (scope.isValid) {
      return null;
    }
    return const ForbiddenFailure(
      message: 'A valid workspace is required to load runtime settings',
      code: 'settings.workspace_scope_required',
    );
  }

  AppFailure _mutationUnavailableFailure() {
    return const ValidationFailure(
      message:
          'Workspace preference writes require a backend settings contract',
      code: 'settings.update_unavailable',
    );
  }
}
