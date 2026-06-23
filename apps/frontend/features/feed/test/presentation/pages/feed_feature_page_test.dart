import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_feed/src/application/use_cases/list_feed_mentions_use_case.dart';
import 'package:social_monitor_feed/src/application/use_cases/triage_mention_use_case.dart';
import 'package:social_monitor_feed/src/domain/entities/feed_mention.dart';
import 'package:social_monitor_feed/src/infrastructure/api/feed_mention_api_dto.dart';
import 'package:social_monitor_feed/src/infrastructure/api_clients/in_memory_feed_api_client.dart';
import 'package:social_monitor_feed/src/infrastructure/repositories/generated_feed_review_catalog.dart';
import 'package:social_monitor_feed/src/presentation/pages/feed_feature_page.dart';
import 'package:social_monitor_feed/src/presentation/stores/feed_review_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/feed_test_fixtures.dart';

void main() {
  testWidgets('renders expanded feed list and safe detail preview', (
    tester,
  ) async {
    final store = _store([feedMentionApiDto()]);

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('Pricing concern on Reddit'), findsWidgets);
    expect(find.text('Safe evidence preview'), findsOneWidget);
    expect(find.text('Mark reviewed'), findsOneWidget);
  });

  testWidgets('compact feed opens detail only after explicit selection', (
    tester,
  ) async {
    final store = _store([feedMentionApiDto()]);

    await _pumpSizedFeature(tester, store: store, size: const Size(390, 780));
    await tester.pumpAndSettle();

    expect(find.text('Safe evidence preview'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Pricing concern on Reddit'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Pricing concern on Reddit'), findsOneWidget);

    await tester.tap(find.text('Pricing concern on Reddit'));
    await tester.pumpAndSettle();

    expect(find.text('Safe evidence preview'), findsOneWidget);
    expect(find.byTooltip('Close detail'), findsOneWidget);
  });

  testWidgets('long feed list uses lazy repeated-row viewport', (tester) async {
    final store = _store([]);
    final items = List<FeedMention>.generate(
      120,
      (index) => feedMention(
        id: 'm-$index',
        title: 'Mention $index',
        sourceName: 'Source $index',
      ),
    );
    store.state = ReadyViewState<PageResult<FeedMention>>(
      PageResult<FeedMention>(items: items, request: const PageRequest()),
    );

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 820),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Mention 0'), findsWidgets);
    expect(find.text('Mention 119'), findsNothing);

    final feedListScrollable = find.descendant(
      of: find.byType(AppDataList<FeedMention>),
      matching: find.byType(Scrollable),
    );
    expect(feedListScrollable, findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Mention 119'),
      600,
      scrollable: feedListScrollable,
    );

    expect(find.text('Mention 119'), findsOneWidget);
  });
}

FeedReviewStore _store(List<FeedMentionApiDto> items) {
  final catalog = GeneratedFeedReviewCatalog(
    apiClient: InMemoryFeedApiClient(items: items),
  );
  return FeedReviewStore(
    listMentions: ListFeedMentionsUseCase(catalog),
    triageMention: TriageMentionUseCase(catalog),
    scope: feedWorkspaceScope,
  );
}

Future<void> _pumpSizedFeature(
  WidgetTester tester, {
  required FeedReviewStore store,
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

  final FeedReviewStore store;
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
