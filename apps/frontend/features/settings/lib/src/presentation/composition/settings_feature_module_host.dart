import 'package:flutter/material.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/load_workspace_settings_use_case.dart';
import '../../application/use_cases/update_digest_preference_use_case.dart';
import '../../application/use_cases/update_telemetry_consent_use_case.dart';
import '../../infrastructure/api/workspace_settings_api_dto.dart';
import '../../infrastructure/api_clients/in_memory_workspace_settings_api_client.dart';
import '../../infrastructure/repositories/generated_workspace_settings_catalog.dart';
import '../pages/settings_feature_page.dart';
import '../stores/workspace_settings_store.dart';

class SettingsFeatureModuleHost extends StatefulWidget {
  const SettingsFeatureModuleHost({
    super.key,
    this.themeMode,
    this.onThemeModeChanged,
  });

  final ThemeMode? themeMode;
  final ValueChanged<ThemeMode>? onThemeModeChanged;

  @override
  State<SettingsFeatureModuleHost> createState() =>
      _SettingsFeatureModuleHostState();
}

class _SettingsFeatureModuleHostState extends State<SettingsFeatureModuleHost> {
  late final WorkspaceSettingsStore _store;

  @override
  void initState() {
    super.initState();
    final catalog = GeneratedWorkspaceSettingsCatalog(
      apiClient: InMemoryWorkspaceSettingsApiClient(
        initialSettings: _demoSettings,
      ),
    );
    _store = WorkspaceSettingsStore(
      loadSettings: LoadWorkspaceSettingsUseCase(catalog),
      updateDigestPreference: UpdateDigestPreferenceUseCase(catalog),
      updateTelemetryConsent: UpdateTelemetryConsentUseCase(catalog),
      scope: const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
    );
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SettingsFeaturePage(
      store: _store,
      themeMode: widget.themeMode,
      onThemeModeChanged: widget.onThemeModeChanged,
    );
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
