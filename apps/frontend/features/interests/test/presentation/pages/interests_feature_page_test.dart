import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_interests/src/application/use_cases/archive_interest_use_case.dart';
import 'package:social_monitor_interests/src/application/use_cases/create_interest_use_case.dart';
import 'package:social_monitor_interests/src/application/use_cases/list_interests_use_case.dart';
import 'package:social_monitor_interests/src/application/use_cases/update_interest_use_case.dart';
import 'package:social_monitor_interests/src/domain/entities/interest_summary.dart';
import 'package:social_monitor_interests/src/infrastructure/api/interest_summary_api_dto.dart';
import 'package:social_monitor_interests/src/infrastructure/api_clients/in_memory_interests_api_client.dart';
import 'package:social_monitor_interests/src/infrastructure/repositories/generated_interest_catalog.dart';
import 'package:social_monitor_interests/src/presentation/pages/interests_feature_page.dart';
import 'package:social_monitor_interests/src/presentation/stores/interests_form_store.dart';
import 'package:social_monitor_interests/src/presentation/stores/interests_list_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  testWidgets('renders store-backed interest list and detail', (tester) async {
    final catalog = _catalog([
      interestSummaryApiDto(),
      interestSummaryApiDto(
        id: 'interest-pricing',
        name: 'Competitor pricing',
        status: 'draft',
        weeklyMentionCount: 8,
      ),
    ]);
    final store = _listStore(catalog);
    final formStore = _formStore(catalog);

    await tester.pumpWidget(_TestApp(store: store, formStore: formStore));
    await tester.pumpAndSettle();

    expect(find.text('Market risk'), findsWidgets);
    expect(find.text('24 mentions this week'), findsOneWidget);
    expect(find.text('Archive'), findsOneWidget);
  });

  testWidgets('creates an interest through the form workflow', (tester) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final catalog = _catalog([interestSummaryApiDto()]);

    await tester.pumpWidget(
      _TestApp(store: _listStore(catalog), formStore: _formStore(catalog)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create interest'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('interest-name-field')), findsOneWidget);
    expect(find.text('Save interest'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('interest-name-field')),
      'Competitor watch',
    );
    await tester.enterText(
      find.byKey(const ValueKey('interest-query-field')),
      'pricing OR launch',
    );
    await tester.tap(find.text('Save interest'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(find.text('Competitor watch'), findsWidgets);
  });

  testWidgets('renders empty interest state', (tester) async {
    final catalog = _catalog([]);

    await tester.pumpWidget(
      _TestApp(store: _listStore(catalog), formStore: _formStore(catalog)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No interests yet'), findsOneWidget);
    expect(
      find.text('Create an interest to start collecting posts.'),
      findsOneWidget,
    );
  });

  testWidgets('renders filtered empty interest state with clear action', (
    tester,
  ) async {
    final catalog = _catalog([]);
    final store = _listStore(catalog);
    await store.updateSearch('missing');

    await tester.pumpWidget(
      _TestApp(store: store, formStore: _formStore(catalog), autoload: false),
    );
    await tester.pumpAndSettle();

    expect(find.text('No interests match these filters'), findsOneWidget);
    expect(
      find.text('Clear filters to return to all monitoring intents.'),
      findsOneWidget,
    );
    expect(find.text('Clear filters'), findsOneWidget);
  });

  testWidgets('renders loading interest state', (tester) async {
    final catalog = _catalog([]);
    final store = _listStore(catalog);
    store.state = const LoadingViewState<PageResult<InterestSummary>>();

    await tester.pumpWidget(
      _TestApp(store: store, formStore: _formStore(catalog), autoload: false),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('renders interest validation state', (tester) async {
    final catalog = _catalog([interestSummaryApiDto()]);
    final formStore = _formStore(catalog);
    formStore.beginCreate();
    formStore.updateName('A');
    formStore.updateQueryText('market risk');
    await formStore.save();

    await tester.pumpWidget(
      _TestApp(
        store: _listStore(catalog),
        formStore: formStore,
        autoload: false,
      ),
    );

    expect(find.text('Interest validation'), findsOneWidget);
    expect(find.textContaining('at least two characters'), findsOneWidget);
  });

  testWidgets('renders interest permission state', (tester) async {
    final catalog = _catalog([interestSummaryApiDto()]);
    final store = _listStore(catalog);
    store.state =
        const PermissionRequiredViewState<PageResult<InterestSummary>>(
          permissionKey: 'interests.write',
          message: 'Interest write access is required.',
        );

    await tester.pumpWidget(
      _TestApp(store: store, formStore: _formStore(catalog), autoload: false),
    );

    expect(find.text('Interest permission required'), findsOneWidget);
    expect(find.text('Interest write access is required.'), findsOneWidget);
  });
}

GeneratedInterestCatalog _catalog(List<InterestSummaryApiDto> items) {
  return GeneratedInterestCatalog(
    apiClient: InMemoryInterestsApiClient(items: items),
  );
}

InterestsListStore _listStore(GeneratedInterestCatalog catalog) {
  return InterestsListStore(
    listInterests: ListInterestsUseCase(catalog),
    scope: testWorkspaceScope,
  );
}

InterestsFormStore _formStore(GeneratedInterestCatalog catalog) {
  return InterestsFormStore(
    createInterest: CreateInterestUseCase(catalog),
    updateInterest: UpdateInterestUseCase(catalog),
    archiveInterest: ArchiveInterestUseCase(catalog),
    scope: testWorkspaceScope,
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.store,
    required this.formStore,
    this.autoload = true,
  });

  final InterestsListStore store;
  final InterestsFormStore formStore;
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
          body: InterestsFeaturePage(
            store: store,
            formStore: formStore,
            autoload: autoload,
          ),
        ),
      ),
    );
  }
}
