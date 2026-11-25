import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/application/use_cases/connect_source_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/list_sources_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_source_health_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/pause_source_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/reconnect_source_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/resume_source_use_case.dart';
import 'package:social_monitor_sources/src/domain/entities/source_summary.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_summary_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_sources_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_source_catalog.dart';
import 'package:social_monitor_sources/src/presentation/pages/sources_feature_page.dart';
import 'package:social_monitor_sources/src/presentation/stores/sources_catalog_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  testWidgets('renders source repair and capability states', (tester) async {
    final store = _store([
      sourceSummaryApiDto(),
      sourceSummaryApiDto(
        id: 'hn',
        name: 'Hacker News',
        credentialHealth: 'healthy',
        healthLabel: 'Healthy',
        capabilityKey: 'sources.hn',
        capabilityEnabled: false,
        collectionStatus: 'paused',
        capabilityDisabledReasonCode: 'provider_beta_disabled',
      ),
    ]);

    await tester.pumpWidget(_TestApp(store: store));
    await tester.pumpAndSettle();

    expect(find.text('RSS feeds credential attention'), findsOneWidget);
    expect(find.text('Credential attention required'), findsOneWidget);
    expect(find.text('Capability off'), findsOneWidget);
    expect(find.text('Health summary'), findsOneWidget);
    expect(find.text('Pause'), findsOneWidget);
  });

  testWidgets('renders disconnected and permission source states', (
    tester,
  ) async {
    final disconnectedStore = _store([
      sourceSummaryApiDto(
        credentialHealth: 'disconnected',
        healthLabel: 'Disconnected',
      ),
    ]);

    await tester.pumpWidget(_TestApp(store: disconnectedStore));
    await tester.pumpAndSettle();
    expect(find.text('Disconnected'), findsWidgets);

    final permissionStore = _store([]);
    permissionStore.state =
        const PermissionRequiredViewState<PageResult<SourceSummary>>(
          permissionKey: 'sources.write',
          message: 'Source write access is required.',
        );

    await tester.pumpWidget(_TestApp(store: permissionStore, autoload: false));
    expect(find.text('Source permission required'), findsOneWidget);
  });

  testWidgets('empty source state offers a connect action', (tester) async {
    final store = _store([]);

    await tester.pumpWidget(_TestApp(store: store));
    await tester.pumpAndSettle();

    expect(find.text('No sources'), findsOneWidget);
    expect(find.text('Connect a source to begin collection.'), findsOneWidget);
    expect(find.text('Connect source'), findsWidgets);

    await tester.tap(find.widgetWithText(AppButton, 'Connect source').last);
    await tester.pumpAndSettle();

    expect(find.text('Web mentions'), findsWidgets);
    expect(find.text('Healthy'), findsWidgets);
  });

  testWidgets('source loading keeps the previous list visible', (tester) async {
    final store = _store([sourceSummaryApiDto()]);
    await store.load();
    final previous =
        (store.state as ReadyViewState<PageResult<SourceSummary>>).value;
    store.state = LoadingViewState<PageResult<SourceSummary>>(
      previousValue: previous,
    );

    await tester.pumpWidget(_TestApp(store: store, autoload: false));

    expect(find.text('RSS feeds'), findsWidgets);
  });
}

SourcesCatalogStore _store(List<SourceSummaryApiDto> items) {
  final catalog = GeneratedSourceCatalog(
    apiClient: InMemorySourcesApiClient(items: items),
  );
  return SourcesCatalogStore(
    listSources: ListSourcesUseCase(catalog),
    connectSource: ConnectSourceUseCase(catalog),
    reconnectSource: ReconnectSourceUseCase(catalog),
    pauseSource: PauseSourceUseCase(catalog),
    resumeSource: ResumeSourceUseCase(catalog),
    loadSourceHealth: LoadSourceHealthUseCase(catalog),
    scope: sourceWorkspaceScope,
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.store, this.autoload = true});

  final SourcesCatalogStore store;
  final bool autoload;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: SourcesFeaturePage(store: store, autoload: autoload),
        ),
      ),
    );
  }
}
