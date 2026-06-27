import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/load_workspace_settings_use_case.dart';
import '../../application/use_cases/update_digest_preference_use_case.dart';
import '../../application/use_cases/update_telemetry_consent_use_case.dart';
import '../../infrastructure/api/workspace_settings_api_dto.dart';
import '../../infrastructure/api_clients/in_memory_workspace_settings_api_client.dart';
import '../../infrastructure/api_clients/runtime_workspace_settings_api_client.dart';
import '../../infrastructure/repositories/generated_workspace_settings_catalog.dart';
import '../stores/workspace_settings_store.dart';

final class SettingsFeatureModule extends Module {
  SettingsFeatureModule.demo()
    : scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      settings = _demoSettings,
      useRuntimeSettings = false;

  SettingsFeatureModule.runtime({
    required this.scope,
    required String workspaceRole,
    required String traceId,
    required String featureSnapshot,
  }) : settings = WorkspaceSettingsApiDto(
         workspaceRole: workspaceRole,
         digestFrequency: 'weekly',
         telemetryConsent: 'not_configured',
         diagnostics: DiagnosticSnapshotApiDto(
           traceId: traceId,
           routeId: 'settings',
           releaseVersion: 'frontend-mvp',
           featureSnapshot: featureSnapshot,
         ),
       ),
       useRuntimeSettings = true;

  final WorkspaceScope scope;
  final WorkspaceSettingsApiDto settings;
  final bool useRuntimeSettings;

  Object get retentionKey {
    return useRuntimeSettings
        ? 'settings-${scope.tenantId}-${scope.workspaceId}'
        : 'settings-demo';
  }

  @override
  void binds(Binder i) {
    i.registerLazySingleton<WorkspaceSettingsApiClient>(_createApiClient);
    i.registerLazySingleton(
      () => GeneratedWorkspaceSettingsCatalog(
        apiClient: i.get<WorkspaceSettingsApiClient>(),
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
  }

  WorkspaceSettingsApiClient _createApiClient() {
    if (useRuntimeSettings) {
      return RuntimeWorkspaceSettingsApiClient(settings: settings);
    }
    return InMemoryWorkspaceSettingsApiClient(initialSettings: settings);
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
