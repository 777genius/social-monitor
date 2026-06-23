import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/update_digest_preference_command.dart';
import '../../application/commands/update_telemetry_consent_command.dart';
import '../../application/queries/load_workspace_settings_query.dart';
import '../../domain/value_objects/digest_frequency.dart';
import '../../domain/value_objects/telemetry_consent_state.dart';
import '../api/workspace_settings_api_dto.dart';

abstract interface class WorkspaceSettingsApiClient {
  Future<Result<WorkspaceSettingsApiDto>> loadSettings(
    LoadWorkspaceSettingsApiRequest request,
  );

  Future<Result<WorkspaceSettingsApiDto>> updateDigestPreference(
    UpdateDigestPreferenceApiRequest request,
  );

  Future<Result<WorkspaceSettingsApiDto>> updateTelemetryConsent(
    UpdateTelemetryConsentApiRequest request,
  );
}

final class LoadWorkspaceSettingsApiRequest {
  const LoadWorkspaceSettingsApiRequest({required this.scope});

  factory LoadWorkspaceSettingsApiRequest.fromQuery(
    LoadWorkspaceSettingsQuery query,
  ) {
    return LoadWorkspaceSettingsApiRequest(scope: query.scope);
  }

  final WorkspaceScope scope;
}

final class UpdateDigestPreferenceApiRequest {
  const UpdateDigestPreferenceApiRequest({
    required this.scope,
    required this.frequency,
  });

  factory UpdateDigestPreferenceApiRequest.fromCommand(
    UpdateDigestPreferenceCommand command,
  ) {
    return UpdateDigestPreferenceApiRequest(
      scope: command.scope,
      frequency: command.frequency,
    );
  }

  final WorkspaceScope scope;
  final DigestFrequency frequency;
}

final class UpdateTelemetryConsentApiRequest {
  const UpdateTelemetryConsentApiRequest({
    required this.scope,
    required this.consent,
  });

  factory UpdateTelemetryConsentApiRequest.fromCommand(
    UpdateTelemetryConsentCommand command,
  ) {
    return UpdateTelemetryConsentApiRequest(
      scope: command.scope,
      consent: command.consent,
    );
  }

  final WorkspaceScope scope;
  final TelemetryConsentState consent;
}

final class InMemoryWorkspaceSettingsApiClient
    implements WorkspaceSettingsApiClient {
  InMemoryWorkspaceSettingsApiClient({
    required WorkspaceSettingsApiDto initialSettings,
    this.canRead = true,
  }) : _settings = initialSettings;

  WorkspaceSettingsApiDto _settings;
  final bool canRead;

  @override
  Future<Result<WorkspaceSettingsApiDto>> loadSettings(
    LoadWorkspaceSettingsApiRequest request,
  ) async {
    final failure = _failureFor(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    return Result.success(_settings);
  }

  @override
  Future<Result<WorkspaceSettingsApiDto>> updateDigestPreference(
    UpdateDigestPreferenceApiRequest request,
  ) async {
    final failure = _failureFor(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    _settings = WorkspaceSettingsApiDto(
      workspaceRole: _settings.workspaceRole,
      digestFrequency: _digestToApi(request.frequency),
      telemetryConsent: _settings.telemetryConsent,
      diagnostics: _settings.diagnostics,
    );
    return Result.success(_settings);
  }

  @override
  Future<Result<WorkspaceSettingsApiDto>> updateTelemetryConsent(
    UpdateTelemetryConsentApiRequest request,
  ) async {
    final failure = _failureFor(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    _settings = WorkspaceSettingsApiDto(
      workspaceRole: _settings.workspaceRole,
      digestFrequency: _settings.digestFrequency,
      telemetryConsent: _consentToApi(request.consent),
      diagnostics: _settings.diagnostics,
    );
    return Result.success(_settings);
  }

  AppFailure? _failureFor(WorkspaceScope scope) {
    if (!scope.isValid) {
      return const ApiProblem(
        title: 'Workspace required',
        status: 403,
        detail: 'A valid workspace is required to load settings',
      ).toFailure();
    }
    if (!canRead) {
      return const ApiProblem(
        title: 'Settings permission required',
        status: 403,
        detail: 'Settings read access is required',
      ).toFailure();
    }
    return null;
  }

  String _digestToApi(DigestFrequency frequency) {
    return switch (frequency) {
      DigestFrequency.off => 'off',
      DigestFrequency.daily => 'daily',
      DigestFrequency.weekly => 'weekly',
      DigestFrequency.unknown => 'unknown',
    };
  }

  String _consentToApi(TelemetryConsentState consent) {
    return switch (consent) {
      TelemetryConsentState.enabled => 'enabled',
      TelemetryConsentState.disabled => 'disabled',
      TelemetryConsentState.notConfigured => 'not_configured',
      TelemetryConsentState.unknown => 'unknown',
    };
  }
}
