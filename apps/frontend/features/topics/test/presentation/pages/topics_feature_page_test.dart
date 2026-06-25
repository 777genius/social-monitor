import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_topics/src/application/use_cases/archive_topic_use_case.dart';
import 'package:social_monitor_topics/src/application/use_cases/create_topic_use_case.dart';
import 'package:social_monitor_topics/src/application/use_cases/list_topics_use_case.dart';
import 'package:social_monitor_topics/src/application/use_cases/update_topic_use_case.dart';
import 'package:social_monitor_topics/src/domain/entities/topic_summary.dart';
import 'package:social_monitor_topics/src/infrastructure/api/topic_summary_api_dto.dart';
import 'package:social_monitor_topics/src/infrastructure/api_clients/in_memory_topics_api_client.dart';
import 'package:social_monitor_topics/src/infrastructure/repositories/generated_topic_catalog.dart';
import 'package:social_monitor_topics/src/presentation/pages/topics_feature_page.dart';
import 'package:social_monitor_topics/src/presentation/stores/topics_form_store.dart';
import 'package:social_monitor_topics/src/presentation/stores/topics_list_store.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  testWidgets('renders store-backed topic list and detail', (tester) async {
    final catalog = _catalog([
      topicSummaryApiDto(),
      topicSummaryApiDto(
        id: 'topic-pricing',
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

  testWidgets('creates a topic through the form workflow', (tester) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final catalog = _catalog([topicSummaryApiDto()]);

    await tester.pumpWidget(
      _TestApp(store: _listStore(catalog), formStore: _formStore(catalog)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create topic'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('topic-name-field')), findsOneWidget);
    expect(find.text('Save topic'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('topic-name-field')),
      'Competitor watch',
    );
    await tester.enterText(
      find.byKey(const ValueKey('topic-query-field')),
      'pricing OR launch',
    );
    await tester.tap(find.text('Save topic'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(find.text('Competitor watch'), findsWidgets);
  });

  testWidgets('renders empty topic state', (tester) async {
    final catalog = _catalog([]);

    await tester.pumpWidget(
      _TestApp(store: _listStore(catalog), formStore: _formStore(catalog)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No topics yet'), findsOneWidget);
    expect(
      find.text('Create a topic to start collecting posts.'),
      findsOneWidget,
    );
  });

  testWidgets('renders filtered empty topic state with clear action', (
    tester,
  ) async {
    final catalog = _catalog([]);
    final store = _listStore(catalog);
    await store.updateSearch('missing');

    await tester.pumpWidget(
      _TestApp(store: store, formStore: _formStore(catalog), autoload: false),
    );
    await tester.pumpAndSettle();

    expect(find.text('No topics match these filters'), findsOneWidget);
    expect(
      find.text('Clear filters to return to all monitoring intents.'),
      findsOneWidget,
    );
    expect(find.text('Clear filters'), findsOneWidget);
  });

  testWidgets('renders loading topic state', (tester) async {
    final catalog = _catalog([]);
    final store = _listStore(catalog);
    store.state = const LoadingViewState<PageResult<TopicSummary>>();

    await tester.pumpWidget(
      _TestApp(store: store, formStore: _formStore(catalog), autoload: false),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('renders topic validation state', (tester) async {
    final catalog = _catalog([topicSummaryApiDto()]);
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

    expect(find.text('Topic validation'), findsOneWidget);
    expect(find.textContaining('at least two characters'), findsOneWidget);
  });

  testWidgets('renders topic permission state', (tester) async {
    final catalog = _catalog([topicSummaryApiDto()]);
    final store = _listStore(catalog);
    store.state = const PermissionRequiredViewState<PageResult<TopicSummary>>(
      permissionKey: 'topics.write',
      message: 'Topic write access is required.',
    );

    await tester.pumpWidget(
      _TestApp(store: store, formStore: _formStore(catalog), autoload: false),
    );

    expect(find.text('Topic permission required'), findsOneWidget);
    expect(find.text('Topic write access is required.'), findsOneWidget);
  });
}

GeneratedTopicCatalog _catalog(List<TopicSummaryApiDto> items) {
  return GeneratedTopicCatalog(
    apiClient: InMemoryTopicsApiClient(items: items),
  );
}

TopicsListStore _listStore(GeneratedTopicCatalog catalog) {
  return TopicsListStore(
    listTopics: ListTopicsUseCase(catalog),
    scope: testWorkspaceScope,
  );
}

TopicsFormStore _formStore(GeneratedTopicCatalog catalog) {
  return TopicsFormStore(
    createTopic: CreateTopicUseCase(catalog),
    updateTopic: UpdateTopicUseCase(catalog),
    archiveTopic: ArchiveTopicUseCase(catalog),
    scope: testWorkspaceScope,
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.store,
    required this.formStore,
    this.autoload = true,
  });

  final TopicsListStore store;
  final TopicsFormStore formStore;
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
          body: TopicsFeaturePage(
            store: store,
            formStore: formStore,
            autoload: autoload,
          ),
        ),
      ),
    );
  }
}
