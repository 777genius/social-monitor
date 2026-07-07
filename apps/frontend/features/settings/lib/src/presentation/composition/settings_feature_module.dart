import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/load_summary_preference_use_case.dart';
import '../../application/use_cases/load_workspace_settings_use_case.dart';
import '../../application/use_cases/save_summary_preference_use_case.dart';
import '../../application/use_cases/update_digest_preference_use_case.dart';
import '../../application/use_cases/update_telemetry_consent_use_case.dart';
import '../../infrastructure/api/workspace_settings_api_dto.dart';
import '../../infrastructure/api_clients/generated_summary_preference_api_client.dart';
import '../../infrastructure/api_clients/generated_workspace_settings_api_client.dart';
import '../../infrastructure/api_clients/in_memory_summary_preference_api_client.dart';
import '../../infrastructure/api_clients/in_memory_workspace_settings_api_client.dart';
import '../../infrastructure/api_clients/summary_preference_api_client.dart';
import '../../infrastructure/repositories/generated_summary_preference_catalog.dart';
import '../../infrastructure/repositories/generated_workspace_settings_catalog.dart';
import '../stores/summary_preference_store.dart';
import '../stores/workspace_settings_store.dart';

final class SettingsFeatureModule extends Module {
  SettingsFeatureModule.demo()
    : scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      userId = 'user-demo',
      settings = _demoSettings,
      generatedApiRuntime = null;

  SettingsFeatureModule.runtime({
    required this.scope,
    required this.userId,
    required this.generatedApiRuntime,
  }) : settings = _demoSettings;

  final WorkspaceScope scope;
  final String userId;
  final WorkspaceSettingsApiDto settings;
  final Object? generatedApiRuntime;

  bool get useRuntimeSettings => generatedApiRuntime != null;

  Object get retentionKey {
    return useRuntimeSettings
        ? 'settings-${scope.tenantId}-${scope.workspaceId}'
        : 'settings-demo';
  }

  @override
  void binds(Binder i) {
    i.registerLazySingleton<WorkspaceSettingsApiClient>(_createApiClient);
    i.registerLazySingleton<SummaryPreferenceApiClient>(
      _createSummaryPreferenceApiClient,
    );
    i.registerLazySingleton(
      () => GeneratedWorkspaceSettingsCatalog(
        apiClient: i.get<WorkspaceSettingsApiClient>(),
      ),
    );
    i.registerLazySingleton(
      () => GeneratedSummaryPreferenceCatalog(
        apiClient: i.get<SummaryPreferenceApiClient>(),
      ),
    );
    i.registerLazySingleton(
      () => WorkspaceSettingsStore(
        loadSettings: LoadWorkspaceSettingsUseCase(
          i.get<GeneratedWorkspaceSettingsCatalog>(),
        ),
        updateDigestPreference: UpdateDigestPreferenceUseCase(
          i.get<GeneratedWorkspaceSettingsCatalog>(),
        ),
        updateTelemetryConsent: UpdateTelemetryConsentUseCase(
          i.get<GeneratedWorkspaceSettingsCatalog>(),
        ),
        scope: scope,
      ),
    );
    i.registerLazySingleton(
      () => SummaryPreferenceStore(
        loadSummaryPreference: LoadSummaryPreferenceUseCase(
          i.get<GeneratedSummaryPreferenceCatalog>(),
        ),
        saveSummaryPreference: SaveSummaryPreferenceUseCase(
          i.get<GeneratedSummaryPreferenceCatalog>(),
        ),
        scope: scope,
        userId: userId,
      ),
    );
  }

  WorkspaceSettingsApiClient _createApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedWorkspaceSettingsApiClient.fromRuntime(runtime: runtime);
    }
    return InMemoryWorkspaceSettingsApiClient(initialSettings: settings);
  }

  SummaryPreferenceApiClient _createSummaryPreferenceApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedSummaryPreferenceApiClient.fromRuntime(runtime: runtime);
    }
    return InMemorySummaryPreferenceApiClient();
  }
}

const _demoSettings = WorkspaceSettingsApiDto(
  workspaceRole: 'Owner',
  digestFrequency: 'weekly',
  telemetryConsent: 'not_configured',
  diagnostics: DiagnosticSnapshotApiDto(
    traceId: 'frontend-demo-session',
    routeId: 'settings',
    releaseVersion: 'frontend-mvp',
    featureSnapshot: 'auth,topics,sources,feed,summaries,settings',
  ),
);
