import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_settings/src/application/use_cases/load_workspace_settings_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/update_digest_preference_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/update_telemetry_consent_use_case.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/in_memory_workspace_settings_api_client.dart';
import 'package:social_monitor_settings/src/infrastructure/repositories/generated_workspace_settings_catalog.dart';
import 'package:social_monitor_settings/src/presentation/pages/settings_feature_page.dart';
import 'package:social_monitor_settings/src/presentation/stores/workspace_settings_store.dart';

import '../../support/settings_test_fixtures.dart';

void main() {
  testWidgets('renders settings diagnostics and copy action', (tester) async {
    final store = _store();

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('Support-safe diagnostics'), findsOneWidget);
    expect(find.text('Telemetry consent'), findsOneWidget);
    expect(find.text('Copy diagnostics'), findsOneWidget);

    await tester.tapAt(tester.getCenter(find.text('Copy diagnostics')));
    await tester.pumpAndSettle();

    expect(find.text('Diagnostics ready to copy'), findsOneWidget);
    expect(find.textContaining('frontend-demo-session'), findsWidgets);
  });
}

WorkspaceSettingsStore _store() {
  final catalog = GeneratedWorkspaceSettingsCatalog(
    apiClient: InMemoryWorkspaceSettingsApiClient(
      initialSettings: workspaceSettingsApiDto(),
    ),
  );
  return WorkspaceSettingsStore(
    loadSettings: LoadWorkspaceSettingsUseCase(catalog),
    updateDigestPreference: UpdateDigestPreferenceUseCase(catalog),
    updateTelemetryConsent: UpdateTelemetryConsentUseCase(catalog),
    scope: settingsWorkspaceScope,
  );
}

Future<void> _pumpSizedFeature(
  WidgetTester tester, {
  required WorkspaceSettingsStore store,
  required Size size,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(_TestApp(store: store, size: size));
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.store, required this.size});

  final WorkspaceSettingsStore store;
  final Size size;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: MediaQuery(
          data: MediaQueryData(size: size),
          child: Scaffold(body: SettingsFeaturePage(store: store)),
        ),
      ),
    );
  }
}
