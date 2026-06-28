import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/workspace_settings_api_dto.dart';
import '../mappers/generated_workspace_settings_rest_mapper.dart';
import 'in_memory_workspace_settings_api_client.dart';

final class GeneratedWorkspaceSettingsApiClient
    implements WorkspaceSettingsApiClient {
  GeneratedWorkspaceSettingsApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedWorkspaceSettingsRestMapper mapper =
        const GeneratedWorkspaceSettingsRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedWorkspaceSettingsApiClient.fromRuntime({
    required Object runtime,
    GeneratedWorkspaceSettingsRestMapper mapper =
        const GeneratedWorkspaceSettingsRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedWorkspaceSettingsApiClient(
      runtime: runtime,
      mapper: mapper,
    );
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedWorkspaceSettingsRestMapper _mapper;

  @override
  Future<Result<WorkspaceSettingsApiDto>> loadSettings(
    LoadWorkspaceSettingsApiRequest request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client
        .send<generated.WorkspaceSettingsResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () => _runtime.rest.workspaceSettings.workspaceSettingsControllerGet(
            xWorkspaceId: scope.workspaceId,
            xTenantId: scope.tenantId,
          ),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.workspaceSettings(dto)),
      onFailure: Result<WorkspaceSettingsApiDto>.failure,
    );
  }

  @override
  Future<Result<WorkspaceSettingsApiDto>> updateDigestPreference(
    UpdateDigestPreferenceApiRequest request,
  ) async {
    final body = _mapper.updateDigestPreference(request);
    if (body == null) {
      return Result.failure(_unsupportedDigestFailure());
    }

    final scope = request.scope;
    final result = await _runtime.client
        .send<generated.WorkspaceSettingsResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () => _runtime.rest.workspaceSettings
              .workspaceSettingsControllerUpdateDigest(
                xWorkspaceId: scope.workspaceId,
                xTenantId: scope.tenantId,
                body: body,
              ),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.workspaceSettings(dto)),
      onFailure: Result<WorkspaceSettingsApiDto>.failure,
    );
  }

  @override
  Future<Result<WorkspaceSettingsApiDto>> updateTelemetryConsent(
    UpdateTelemetryConsentApiRequest request,
  ) async {
    final body = _mapper.updateTelemetryConsent(request);
    if (body == null) {
      return Result.failure(_unsupportedTelemetryFailure());
    }

    final scope = request.scope;
    final result = await _runtime.client
        .send<generated.WorkspaceSettingsResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () => _runtime.rest.workspaceSettings
              .workspaceSettingsControllerUpdateTelemetry(
                xWorkspaceId: scope.workspaceId,
                xTenantId: scope.tenantId,
                body: body,
              ),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.workspaceSettings(dto)),
      onFailure: Result<WorkspaceSettingsApiDto>.failure,
    );
  }

  AppFailure _unsupportedDigestFailure() {
    return const ValidationFailure(
      message: 'A supported digest frequency is required',
      code: 'settings.digest_frequency_unsupported',
    );
  }

  AppFailure _unsupportedTelemetryFailure() {
    return const ValidationFailure(
      message: 'A supported telemetry consent value is required',
      code: 'settings.telemetry_consent_unsupported',
    );
  }
}
