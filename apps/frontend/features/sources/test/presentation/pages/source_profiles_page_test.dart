import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_sources/src/application/use_cases/list_source_profiles_use_case.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_profile_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_source_profiles_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_source_profile_catalog.dart';
import 'package:social_monitor_sources/src/presentation/pages/source_profiles_page.dart';
import 'package:social_monitor_sources/src/presentation/stores/source_profiles_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  testWidgets('renders provider profiles and expands limitations', (
    tester,
  ) async {
    final store = _store([
      sourceProfileApiDto(),
      sourceProfileApiDto(
        providerKey: 'rss',
        displayName: 'RSS',
        supportedQueryModes: const ['keyword'],
        supportedContentUnits: const ['articles'],
        limitations: const ['Feeds may have inconsistent metadata'],
      ),
      sourceProfileApiDto(
        providerKey: 'hn',
        displayName: 'Hacker News',
        health: const SourceProfileHealthApiDto(
          state: 'unsupported_scope',
          reasonCode: 'runtime_deferred',
          message: 'Hacker News source runtime disabled.',
          signals: ['runtime_deferred'],
        ),
        readinessState: 'profiled',
        runtimeReadiness: 'deferred',
        limitations: const ['Backend integration deferred'],
        liveBetaBlockers: const ['No data retrieval in this build'],
      ),
      sourceProfileApiDto(
        providerKey: 'github',
        displayName: 'GitHub',
        health: const SourceProfileHealthApiDto(
          state: 'unsupported_scope',
          reasonCode: 'runtime_deferred',
          message: 'GitHub source runtime disabled.',
          signals: ['runtime_deferred'],
        ),
        readinessState: 'profiled',
        runtimeReadiness: 'deferred',
        supportedContentUnits: const ['issues', 'pull requests'],
      ),
    ]);

    await tester.pumpWidget(_TestApp(store: store));
    await tester.pumpAndSettle();

    expect(find.text('Source profiles'), findsOneWidget);
    expect(find.text('Reddit'), findsOneWidget);
    expect(find.text('RSS'), findsOneWidget);
    expect(find.text('Hacker News'), findsOneWidget);
    expect(find.text('GitHub'), findsOneWidget);
    expect(find.text('Unsupported scope'), findsWidgets);
    expect(find.text('Connect source'), findsNothing);

    await tester.tap(find.byTooltip('Show limitations').first);
    await tester.pumpAndSettle();

    expect(find.text('Limitations'), findsWidgets);
    expect(
      find.text('Rate limits vary by subreddit and endpoint'),
      findsOneWidget,
    );
  });
}

SourceProfilesStore _store(List<SourceProfileApiDto> items) {
  final catalog = GeneratedSourceProfileCatalog(
    apiClient: InMemorySourceProfilesApiClient(items: items),
  );
  return SourceProfilesStore(
    listSourceProfiles: ListSourceProfilesUseCase(catalog),
    scope: sourceWorkspaceScope,
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.store});

  final SourceProfilesStore store;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(body: SourceProfilesPage(store: store)),
      ),
    );
  }
}
