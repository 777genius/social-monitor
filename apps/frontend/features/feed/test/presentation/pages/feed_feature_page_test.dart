import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_feed/src/application/use_cases/list_feed_items_use_case.dart';
import 'package:social_monitor_feed/src/application/use_cases/load_feed_item_use_case.dart';
import 'package:social_monitor_feed/src/domain/entities/feed_item.dart';
import 'package:social_monitor_feed/src/infrastructure/api/feed_item_api_dto.dart';
import 'package:social_monitor_feed/src/infrastructure/api_clients/in_memory_feed_items_api_client.dart';
import 'package:social_monitor_feed/src/infrastructure/repositories/generated_feed_item_catalog.dart';
import 'package:social_monitor_feed/src/presentation/pages/feed_feature_page.dart';
import 'package:social_monitor_feed/src/presentation/stores/feed_items_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/feed_test_fixtures.dart';

void main() {
  testWidgets('renders expanded feed list and backend-real detail', (
    tester,
  ) async {
    final store = _store([
      feedItemApiDto(
        providerKey: 'github-repo-radar',
        title: 'openai/codex is trending on GitHub',
        canonicalUrl: 'https://github.com/openai/codex',
        authorHandle: 'openai',
        providerMetadata: githubRepositoryTrendMetadataFixture(),
      ),
    ]);

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('openai/codex is trending on GitHub'), findsWidgets);
    expect(find.text('Repo Radar'), findsWidgets);
    expect(find.text('54.0k stars'), findsOneWidget);
    expect(find.text('Repository trend'), findsOneWidget);
    expect(find.text('openai/codex'), findsWidgets);
    expect(find.text('+1,200'), findsOneWidget);
    expect(find.text('Body preview'), findsOneWidget);
    expect(find.text('Canonical URL'), findsOneWidget);
    expect(find.text('Copy URL'), findsOneWidget);
    expect(find.text('Mark reviewed'), findsNothing);
  });

  testWidgets('compact feed opens detail only after explicit selection', (
    tester,
  ) async {
    final store = _store([feedItemApiDto()]);

    await _pumpSizedFeature(tester, store: store, size: const Size(390, 780));
    await tester.pumpAndSettle();

    expect(find.text('Body preview'), findsNothing);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('feed-item-card-feed-1')),
      120,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.tap(find.byKey(const ValueKey('feed-item-card-feed-1')));
    await tester.pumpAndSettle();

    expect(find.text('Body preview'), findsOneWidget);
    expect(find.byTooltip('Close detail'), findsOneWidget);
  });

  testWidgets('long feed list uses lazy repeated-row viewport', (tester) async {
    final store = _store([]);
    final items = List<FeedItem>.generate(
      120,
      (index) => feedItem(id: 'feed-$index', title: 'Feed item $index'),
    );
    store.state = ReadyViewState<PageResult<FeedItem>>(
      PageResult<FeedItem>(items: items, request: const PageRequest()),
    );

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 820),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Feed item 0'), findsWidgets);
    expect(find.text('Feed item 119'), findsNothing);

    final feedListScrollable = find.descendant(
      of: find.byType(AppDataList<FeedItem>),
      matching: find.byType(Scrollable),
    );
    expect(feedListScrollable, findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Feed item 119'),
      600,
      scrollable: feedListScrollable,
    );

    expect(find.text('Feed item 119'), findsOneWidget);
  });

  testWidgets('filters repo radar cards by provider and repository facets', (
    tester,
  ) async {
    final store = _store([
      feedItemApiDto(
        id: 'feed-codex',
        providerKey: 'github-repo-radar',
        title: 'openai/codex is trending on GitHub',
        canonicalUrl: 'https://github.com/openai/codex',
        providerMetadata: githubRepositoryTrendMetadataFixture(),
      ),
      feedItemApiDto(
        id: 'feed-rust',
        providerKey: 'github-repo-radar',
        title: 'astral-sh/uv is trending on GitHub',
        canonicalUrl: 'https://github.com/astral-sh/uv',
        providerMetadata: githubRepositoryTrendMetadataFixture(
          fullName: 'astral-sh/uv',
          url: 'https://github.com/astral-sh/uv',
          language: 'Rust',
          topics: const ['python', 'cli'],
          primaryWindow: '7d',
          rank: 2,
        ),
      ),
      feedItemApiDto(
        id: 'feed-reddit',
        providerKey: 'reddit',
        title: 'Reddit pricing discussion',
      ),
    ]);

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('Reddit pricing discussion'), findsWidgets);
    await tester.tap(
      find.widgetWithText(FilterChip, 'Provider: Repo Radar').first,
    );
    await tester.pumpAndSettle();

    expect(find.text('openai/codex is trending on GitHub'), findsWidgets);
    expect(find.text('astral-sh/uv is trending on GitHub'), findsWidgets);
    expect(find.text('Reddit pricing discussion'), findsNothing);

    await tester.tap(
      find.widgetWithText(FilterChip, 'Language: TypeScript').first,
    );
    await tester.pumpAndSettle();

    expect(find.text('openai/codex is trending on GitHub'), findsWidgets);
    expect(find.text('astral-sh/uv is trending on GitHub'), findsNothing);
  });
}

FeedItemsStore _store(List<FeedItemApiDto> items) {
  final catalog = GeneratedFeedItemCatalog(
    apiClient: InMemoryFeedItemsApiClient(items: items),
  );
  return FeedItemsStore(
    listFeedItems: ListFeedItemsUseCase(catalog),
    loadFeedItem: LoadFeedItemUseCase(catalog),
    scope: feedWorkspaceScope,
  );
}

Future<void> _pumpSizedFeature(
  WidgetTester tester, {
  required FeedItemsStore store,
  required Size size,
  bool autoload = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    _TestApp(store: store, size: size, autoload: autoload),
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.store,
    required this.size,
    required this.autoload,
  });

  final FeedItemsStore store;
  final Size size;
  final bool autoload;

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
            body: FeedFeaturePage(store: store, autoload: autoload),
          ),
        ),
      ),
    );
  }
}
