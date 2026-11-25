import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/update_digest_preference_command.dart';
import '../../application/commands/update_telemetry_consent_command.dart';
import '../../application/queries/load_workspace_settings_query.dart';
import '../../application/use_cases/load_workspace_settings_use_case.dart';
import '../../application/use_cases/update_digest_preference_use_case.dart';
import '../../application/use_cases/update_telemetry_consent_use_case.dart';
import '../../domain/entities/diagnostic_snapshot.dart';
import '../../domain/entities/workspace_settings.dart';
import '../../domain/value_objects/digest_frequency.dart';
import '../../domain/value_objects/telemetry_consent_state.dart';

final class WorkspaceSettingsStore extends ChangeNotifier {
  WorkspaceSettingsStore({
    required LoadWorkspaceSettingsUseCase loadSettings,
    required UpdateDigestPreferenceUseCase updateDigestPreference,
    required UpdateTelemetryConsentUseCase updateTelemetryConsent,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
  }) : _loadSettings = loadSettings,
       _updateDigestPreference = updateDigestPreference,
       _updateTelemetryConsent = updateTelemetryConsent,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final LoadWorkspaceSettingsUseCase _loadSettings;
  final UpdateDigestPreferenceUseCase _updateDigestPreference;
  final UpdateTelemetryConsentUseCase _updateTelemetryConsent;
  final OperationGenerationGuard _generationGuard;

  WorkspaceScope _scope;

  AsyncViewState<WorkspaceSettings> state =
      const InitialViewState<WorkspaceSettings>();
  AsyncViewState<WorkspaceSettings> mutationState =
      const InitialViewState<WorkspaceSettings>();
  AsyncViewState<DiagnosticSnapshot> diagnosticsCopyState =
      const InitialViewState<DiagnosticSnapshot>();

  WorkspaceScope get scope => _scope;

  UserActionIntent digestIntentFor(DigestFrequency frequency) {
    return UserActionIntent(
      id: 'settings.digest.${frequency.name}',
      disabledReasonCode: frequency == DigestFrequency.unknown
          ? 'settings.digest_frequency_invalid'
          : null,
      idempotencyKey: '${_scope.workspaceId}:digest:${frequency.name}',
    );
  }

  UserActionIntent telemetryIntentFor(TelemetryConsentState consent) {
    return UserActionIntent(
      id: 'settings.telemetry.${consent.name}',
      disabledReasonCode: consent == TelemetryConsentState.unknown
          ? 'settings.telemetry_consent_invalid'
          : null,
      idempotencyKey: '${_scope.workspaceId}:telemetry:${consent.name}',
    );
  }

  UserActionIntent copyDiagnosticsIntentFor(WorkspaceSettings settings) {
    return UserActionIntent(
      id: 'settings.diagnostics.copy',
      idempotencyKey: '${_scope.workspaceId}:${settings.diagnostics.traceId}',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    state = const InitialViewState<WorkspaceSettings>();
    mutationState = const InitialViewState<WorkspaceSettings>();
    diagnosticsCopyState = const InitialViewState<DiagnosticSnapshot>();
    notifyListeners();
  }

  Future<void> load() async {
    final generation = _generationGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<WorkspaceSettings>(:final value) => value,
      LoadingViewState<WorkspaceSettings>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    state = LoadingViewState<WorkspaceSettings>(previousValue: previous);
    notifyListeners();

    final result = await _loadSettings(
      LoadWorkspaceSettingsQuery(scope: _scope),
    );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }

    state = _stateFromResult(result);
    notifyListeners();
  }

  Future<void> updateDigest(DigestFrequency frequency) async {
    final intent = digestIntentFor(frequency);
    if (!intent.isEnabled) {
      mutationState = FailureViewState<WorkspaceSettings>(
        failure: ValidationFailure(
          message: 'Choose a valid digest frequency',
          code: intent.disabledReasonCode,
          field: 'frequency',
        ),
      );
      notifyListeners();
      return;
    }
    await _mutate(
      _updateDigestPreference(
        UpdateDigestPreferenceCommand(scope: _scope, frequency: frequency),
      ),
    );
  }

  Future<void> updateTelemetry(TelemetryConsentState consent) async {
    final intent = telemetryIntentFor(consent);
    if (!intent.isEnabled) {
      mutationState = FailureViewState<WorkspaceSettings>(
        failure: ValidationFailure(
          message: 'Choose a valid telemetry consent state',
          code: intent.disabledReasonCode,
          field: 'consent',
        ),
      );
      notifyListeners();
      return;
    }
    await _mutate(
      _updateTelemetryConsent(
        UpdateTelemetryConsentCommand(scope: _scope, consent: consent),
      ),
    );
  }

  void prepareDiagnosticsCopy(WorkspaceSettings settings) {
    diagnosticsCopyState = ReadyViewState<DiagnosticSnapshot>(
      settings.diagnostics,
    );
    notifyListeners();
  }

  Future<void> _mutate(Future<Result<WorkspaceSettings>> operation) async {
    final previous = switch (state) {
      ReadyViewState<WorkspaceSettings>(:final value) => value,
      _ => null,
    };
    mutationState = LoadingViewState<WorkspaceSettings>(
      previousValue: previous,
    );
    notifyListeners();

    final result = await operation;
    mutationState = result.fold(
      onSuccess: (settings) {
        state = ReadyViewState<WorkspaceSettings>(settings);
        return ReadyViewState<WorkspaceSettings>(settings);
      },
      onFailure: (failure) =>
          FailureViewState<WorkspaceSettings>(failure: failure),
    );
    notifyListeners();
  }

  AsyncViewState<WorkspaceSettings> _stateFromResult(
    Result<WorkspaceSettings> result,
  ) {
    return result.fold(
      onSuccess: ReadyViewState<WorkspaceSettings>.new,
      onFailure: (failure) {
        if (failure is ForbiddenFailure) {
          return PermissionRequiredViewState<WorkspaceSettings>(
            permissionKey: failure.code ?? 'settings.read',
            message: failure.message,
          );
        }
        return FailureViewState<WorkspaceSettings>(failure: failure);
      },
    );
  }
}
