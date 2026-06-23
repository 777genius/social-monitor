import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_settings/src/application/use_cases/load_workspace_settings_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/update_digest_preference_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/update_telemetry_consent_use_case.dart';
import 'package:social_monitor_settings/src/domain/entities/diagnostic_snapshot.dart';
import 'package:social_monitor_settings/src/domain/entities/workspace_settings.dart';
import 'package:social_monitor_settings/src/domain/value_objects/digest_frequency.dart';
import 'package:social_monitor_settings/src/domain/value_objects/telemetry_consent_state.dart';
import 'package:social_monitor_settings/src/infrastructure/api/workspace_settings_api_dto.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/in_memory_workspace_settings_api_client.dart';
import 'package:social_monitor_settings/src/infrastructure/repositories/generated_workspace_settings_catalog.dart';
import 'package:social_monitor_settings/src/presentation/stores/workspace_settings_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/settings_test_fixtures.dart';

void main() {
  test('validates digest preference before mutation', () async {
    final store = _store();

    await store.load();
    await store.updateDigest(DigestFrequency.unknown);

    final state = store.mutationState as FailureViewState<WorkspaceSettings>;
    expect(state.failure, isA<ValidationFailure>());
    expect(state.failure.code, 'settings.digest_frequency_invalid');
  });

  test('updates telemetry consent state', () async {
    final store = _store();

    await store.load();
    await store.updateTelemetry(TelemetryConsentState.enabled);

    final state = store.state as ReadyViewState<WorkspaceSettings>;
    expect(state.value.telemetryConsent, TelemetryConsentState.enabled);
  });

  test('prepares redacted diagnostics copy text', () async {
    final store = _store(
      initialSettings: workspaceSettingsApiDto(
        diagnostics: diagnosticSnapshotApiDto(
          traceId: 'trace Bearer demo',
          featureSnapshot: 'features sk-demo',
        ),
      ),
    );

    await store.load();
    final state = store.state as ReadyViewState<WorkspaceSettings>;
    store.prepareDiagnosticsCopy(state.value);

    final copyState =
        store.diagnosticsCopyState as ReadyViewState<DiagnosticSnapshot>;
    expect(copyState.value.safeCopyText, contains('[redacted]'));
    expect(copyState.value.safeCopyText, isNot(contains('Bearer demo')));
    expect(copyState.value.safeCopyText, isNot(contains('sk-demo')));
  });

  test('permission failure maps to permission-required state', () async {
    final store = _store(canRead: false);

    await store.load();

    expect(store.state, isA<PermissionRequiredViewState<WorkspaceSettings>>());
  });
}

WorkspaceSettingsStore _store({
  bool canRead = true,
  WorkspaceSettingsApiDto? initialSettings,
}) {
  final catalog = GeneratedWorkspaceSettingsCatalog(
    apiClient: InMemoryWorkspaceSettingsApiClient(
      initialSettings: initialSettings ?? workspaceSettingsApiDto(),
      canRead: canRead,
    ),
  );
  return WorkspaceSettingsStore(
    loadSettings: LoadWorkspaceSettingsUseCase(catalog),
    updateDigestPreference: UpdateDigestPreferenceUseCase(catalog),
    updateTelemetryConsent: UpdateTelemetryConsentUseCase(catalog),
    scope: settingsWorkspaceScope,
  );
}
