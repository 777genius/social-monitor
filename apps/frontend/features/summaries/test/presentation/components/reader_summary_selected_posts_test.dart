import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_top_posts_section_sliver.dart';

import '../../support/reader_posts_browse_test_catalog.dart';
import '../../support/top_posts_show_more_test_app.dart';
import '../../support/top_posts_sort_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  testWidgets(
    'keeps the unavailable notice and browse checkbox on an empty selected board',
    (tester) async {
      final catalog = ControlledReaderPostCatalog();
      final browse = catalog.createStore()..selectOnly(true);
      addTearDown(browse.dispose);
      final theme = AppTheme.light();
      final summary = topPostsSummaryFixture(
        topReads: const [],
        citations: const [
          SummaryCitation(
            id: 'synthetic-citation',
            sourceLabel: 'Synthetic source',
            safeSnippet: 'Synthetic citation',
            feedItemId: 'synthetic-feed',
            sourceItemId: 'synthetic-source',
          ),
        ],
      );
      await tester.pumpWidget(
        AppHeadlessScope(
          theme: theme,
          appBuilder: (overlay) => MaterialApp(
            theme: theme,
            builder: overlay,
            home: Scaffold(
              body: CustomScrollView(
                slivers: [
                  ReaderSummaryTopPostsSectionSliver(
                    summary: summary,
                    contentPadding: const EdgeInsets.all(16),
                    onOpenUrl: (_) {},
                    browseStore: browse,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Verified Top posts unavailable'), findsOneWidget);
      expect(find.text('Selected posts'), findsOneWidget);
      expect(
        find.text('No posts match the current source filters.'),
        findsNothing,
      );
    },
  );

  testWidgets(
    'Selected posts toggles the real browse workflow and retains sorting',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = ControlledReaderPostCatalog();
      final browse = catalog.createStore();
      final sort = topPostsSortStoreFor(FakeTopPostsSortPreferenceStore());
      addTearDown(browse.dispose);
      addTearDown(sort.dispose);
      final theme = AppTheme.light();
      await tester.pumpWidget(
        AppHeadlessScope(
          theme: theme,
          appBuilder: (overlay) => MaterialApp(
            theme: theme,
            builder: overlay,
            home: Scaffold(
              body: CustomScrollView(
                slivers: [
                  ReaderSummaryTopPostsSectionSliver(
                    summary: showMoreSummaryFixture(),
                    contentPadding: const EdgeInsets.all(16),
                    onOpenUrl: (_) {},
                    sortStore: sort,
                    browseStore: browse,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Selected posts'), findsOneWidget);
      expect(browse.selectedOnly, isFalse);
      expect(catalog.queries.single.order, TopPostsSortOrder.engagement);
      expect(find.text('All posts'), findsOneWidget);
      expect(catalog.queries, hasLength(1));
      catalog.responses.single.complete(
        Result.success(
          ReaderPostsPage(
            items: [engagementTopPost('outside-selection', engagement: 1000)],
            total: 2,
            providerKeys: const ['x-twitter'],
            nextCursor: 'synthetic-next',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Post outside-selection'), findsOneWidget);
      expect(find.text('Show more (1)'), findsOneWidget);
      await tester.tap(
        find.byKey(const ValueKey('reader-summary-top-posts-sort-model')),
      );
      await tester.pump();
      expect(catalog.queries, hasLength(2));
      catalog.responses.last.complete(
        const Result.success(
          ReaderPostsPage(items: [], total: 0, providerKeys: []),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('reader-summary-selected-posts')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Top posts'), findsOneWidget);
      expect(browse.selectedOnly, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}
