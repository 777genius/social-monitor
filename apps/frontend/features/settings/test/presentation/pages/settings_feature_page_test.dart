import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_settings/src/application/use_cases/load_summary_preference_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/load_workspace_settings_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/save_summary_preference_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/update_digest_preference_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/update_telemetry_consent_use_case.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/in_memory_summary_preference_api_client.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/in_memory_workspace_settings_api_client.dart';
import 'package:social_monitor_settings/src/infrastructure/repositories/generated_summary_preference_catalog.dart';
import 'package:social_monitor_settings/src/infrastructure/repositories/generated_workspace_settings_catalog.dart';
import 'package:social_monitor_settings/src/presentation/pages/settings_feature_page.dart';
import 'package:social_monitor_settings/src/presentation/stores/summary_preference_store.dart';
import 'package:social_monitor_settings/src/presentation/stores/workspace_settings_store.dart';

import '../../support/settings_test_fixtures.dart';

void main() {
  testWidgets('renders settings diagnostics and copy action', (tester) async {
    final store = _store();
    final summaryStore = _summaryStore();

    await _pumpSizedFeature(
      tester,
      store: store,
      summaryPreferenceStore: summaryStore,
      size: const Size(1280, 820),
    );
    await tester.pumpAndSettle();

    expect(find.text('Summary style'), findsOneWidget);
    expect(find.text('Custom prompt'), findsOneWidget);
    expect(find.text('Support-safe diagnostics'), findsOneWidget);
    expect(find.text('Telemetry consent'), findsOneWidget);
    expect(find.text('Copy diagnostics'), findsOneWidget);

    final copyButton = find.byKey(
      const ValueKey('settings-copy-diagnostics-true'),
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -800));
    await tester.pumpAndSettle();
    await tester.tap(copyButton);
    await tester.pumpAndSettle();

    expect(find.text('Diagnostics ready to copy'), findsOneWidget);
    expect(find.textContaining('frontend-demo-session'), findsWidgets);
  });

  testWidgets('saves custom summary prompt from settings panel', (
    tester,
  ) async {
    final store = _store();
    final summaryStore = _summaryStore();

    await _pumpSizedFeature(
      tester,
      store: store,
      summaryPreferenceStore: summaryStore,
      size: const Size(1280, 820),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey('settings-summary-custom-prompt-field')),
      'Focus on production impact.\nSkip weak launch chatter.',
    );
    await tester.tap(find.text('Bullets'));
    final saveButton = find.byKey(
      const ValueKey('settings-summary-preference-save-true'),
    );
    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(summaryStore.customInstructions, contains('production impact'));
    expect(summaryStore.customInstructions, contains('\n'));
    expect(summaryStore.format.name, 'bulletDigest');
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

SummaryPreferenceStore _summaryStore() {
  final catalog = GeneratedSummaryPreferenceCatalog(
    apiClient: InMemorySummaryPreferenceApiClient(
      preference: summaryPreferenceApiDto(source: 'none'),
    ),
  );
  return SummaryPreferenceStore(
    loadSummaryPreference: LoadSummaryPreferenceUseCase(catalog),
    saveSummaryPreference: SaveSummaryPreferenceUseCase(catalog),
    scope: settingsWorkspaceScope,
    userId: 'user-demo',
  );
}

Future<void> _pumpSizedFeature(
  WidgetTester tester, {
  required WorkspaceSettingsStore store,
  required SummaryPreferenceStore summaryPreferenceStore,
  required Size size,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    _TestApp(
      store: store,
      summaryPreferenceStore: summaryPreferenceStore,
      size: size,
    ),
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.store,
    required this.summaryPreferenceStore,
    required this.size,
  });

  final WorkspaceSettingsStore store;
  final SummaryPreferenceStore summaryPreferenceStore;
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
          child: Scaffold(
            body: SettingsFeaturePage(
              store: store,
              summaryPreferenceStore: summaryPreferenceStore,
            ),
          ),
        ),
      ),
    );
  }
}
