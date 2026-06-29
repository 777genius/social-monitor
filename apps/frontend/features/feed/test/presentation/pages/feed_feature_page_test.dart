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
        normalizedSignal: feedSignalApiDto(
          score: 91,
          band: 'breakout',
          providerKey: 'github-repo-radar',
          sourceKey: 'repo-trending:24h',
          contentType: 'repository',
        ),
        providerMetadata: githubRepositoryTrendMetadataFixture(),
        providerMetrics: githubRepositoryMetricsFixture(),
      ),
    ]);

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('openai/codex is trending on GitHub'), findsWidgets);
    expect(find.text('Today\'s summary'), findsOneWidget);
    expect(find.textContaining('reader summary'), findsNothing);
    expect(find.text('Repo Radar'), findsWidgets);
    expect(find.textContaining('GH Archive WatchEvent'), findsWidgets);
    expect(find.textContaining('1 hour'), findsWidgets);
    expect(find.text('Signal 91 - Breakout'), findsWidgets);
    expect(find.text('GitHub stars 54.0k'), findsWidgets);
    expect(find.text('GitHub forks 6.1k'), findsWidgets);
    expect(find.text('Repo Radar trend +210 / 24h'), findsWidgets);
    expect(find.text('Repo Radar trend +360 / 48h'), findsWidgets);
    expect(find.text('Repo Radar trend +1.2k / 7d'), findsWidgets);
    expect(find.text('Repository trend'), findsOneWidget);
    expect(find.text('openai/codex'), findsWidgets);
    expect(find.text('Primary window'), findsOneWidget);
    expect(find.text('24h'), findsOneWidget);
    expect(find.text('Checked'), findsOneWidget);
    expect(find.text('Evidence source'), findsOneWidget);
    expect(find.text('Freshness'), findsOneWidget);
    expect(find.text('Body preview'), findsOneWidget);
    expect(find.text('Source link'), findsOneWidget);
    expect(find.text('Copy URL'), findsOneWidget);
    expect(find.text('All loaded'), findsNothing);
    expect(find.text('Mark reviewed'), findsNothing);
  });

  testWidgets('renders filtered empty feed state with clear action', (
    tester,
  ) async {
    final store = _store([]);
    await store.updateSearch('missing');

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 820),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('No posts match these filters'), findsOneWidget);
    expect(
      find.text('Clear filters to return to all collected posts.'),
      findsOneWidget,
    );
    expect(find.text('Clear filters'), findsOneWidget);
  });

  testWidgets('labels provider-native metrics without calling them rating', (
    tester,
  ) async {
    final store = _store([
      feedItemApiDto(
        id: 'feed-reddit',
        providerKey: 'reddit',
        title: 'Reddit agent discussion',
        providerMetrics: redditPostMetricsFixture(score: 540, comments: 126),
        normalizedSignal: feedSignalApiDto(score: 88, band: 'high'),
      ),
      feedItemApiDto(
        id: 'feed-trending',
        providerKey: 'github-trending-page',
        title: 'calesthio/OpenMontage tops GitHub Trending',
        providerMetrics: githubTrendingRepositoryMetricsFixture(),
        normalizedSignal: feedSignalApiDto(
          score: 94,
          band: 'breakout',
          providerKey: 'github-trending-page',
          sourceKey: 'github-trending-page:daily',
          contentType: 'repository',
        ),
      ),
      feedItemApiDto(
        id: 'feed-hn',
        providerKey: 'hacker-news',
        title: 'HN discussion on model routing',
        providerMetrics: const {
          'kind': 'hacker_news_story',
          'sourceKey': 'hn:front-page',
          'points': 312,
          'comments': 74,
        },
        normalizedSignal: feedSignalApiDto(
          score: 76,
          band: 'normal',
          providerKey: 'hacker-news',
          sourceKey: 'hn:front-page',
          contentType: 'story',
        ),
      ),
      feedItemApiDto(
        id: 'feed-x',
        providerKey: 'x-twitter',
        title: 'X thread about AI search agents',
        providerMetrics: const {
          'kind': 'x_post',
          'sourceKey': 'account:openai',
          'likes': 1200,
          'reposts': 340,
          'replies': 89,
          'quotes': 27,
          'bookmarks': 460,
          'impressions': 50000,
        },
        normalizedSignal: feedSignalApiDto(
          score: 81,
          band: 'high',
          providerKey: 'x-twitter',
          sourceKey: 'account:openai',
        ),
      ),
    ]);

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('Signal 88 - High'), findsWidgets);
    expect(find.text('Reddit score 540'), findsWidgets);
    expect(find.text('GitHub rank #1'), findsWidgets);
    expect(find.text('GitHub stars +3.7k / daily'), findsWidgets);
    expect(find.text('HN 312 points'), findsWidgets);
    expect(find.text('X likes 1.2k'), findsWidgets);
    expect(find.textContaining('rating'), findsNothing);
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
          primaryWindow: '48h',
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
