import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import 'support/reader_summary_board_interaction.dart';
import 'support/reader_summary_production_wiring.dart';
import 'support/reader_summary_scenario_data.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const fixtureBaseUrl = String.fromEnvironment(
    'READER_SUMMARY_HTTP_FIXTURE_BASE_URL',
  );

  testWidgets(
    'backend policy survives persistence REST and production summary wiring',
    (tester) async {
      expect(
        fixtureBaseUrl,
        isNotEmpty,
        reason: 'READER_SUMMARY_HTTP_FIXTURE_BASE_URL is required',
      );
      tester.view.physicalSize = const Size(1200, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final runtime = generated.createGeneratedApiRuntime(
        generated.GeneratedApiConfiguration(
          baseUrl: fixtureBaseUrl,
          workspaceRoleProvider: () => 'viewer',
        ),
      );
      addTearDown(() => runtime.close(force: true));

      final openedUrls = <String>[];
      await tester.pumpWidget(
        ReaderSummaryProductionWiringApp(
          runtime: runtime,
          onOpenReaderSource: (uri) => openedUrls.add(uri.toString()),
        ),
      );
      await pumpUntilReaderSummaryReady(
        tester,
        find.byKey(const ValueKey('published-reader-summary-view')),
      );
      await tester.pumpAndSettle();
      final publishedSummaryScrollView = find.byKey(
        const PageStorageKey<String>('published-summary-scroll-view'),
      );
      final outerScrollable = publishedSummaryOuterScrollable();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('reader-summary-top-posts-board-posts')),
        600,
        scrollable: outerScrollable,
      );
      await tester.pumpAndSettle();

      expect(publishedSummaryScrollView, findsOneWidget);
      expect(find.bySemanticsLabel('Top posts, 5 items'), findsOneWidget);
      final topPostsList = readerSummaryList();
      await exerciseReaderSummaryBoard(
        tester,
        topPostsList,
        titles: topTitles,
        primaryUrls: topUrls,
        authorizedUrlsByPost: topAuthorizedUrlsByPost,
        openedUrls: openedUrls,
        exactTitles: const {
          'Cursor agent update reaches HN',
          'SpaceX repository accelerates',
        },
      );
      expectRejectedReaderSummaryContentAbsent();
      final additionalStoriesToggle = find.byKey(
        const ValueKey('reader-summary-top-posts-board-additional-stories'),
        skipOffstage: false,
      );
      await tester.scrollUntilVisible(
        additionalStoriesToggle,
        -600,
        scrollable: outerScrollable,
      );
      await tester.pumpAndSettle();
      await tester.tap(additionalStoriesToggle);
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel('Additional stories, 5 items'),
        findsOneWidget,
      );
      await exerciseReaderSummaryBoard(
        tester,
        topPostsList,
        titles: additionalTitles,
        primaryUrls: additionalUrls,
        authorizedUrlsByPost: additionalAuthorizedUrlsByPost,
        openedUrls: openedUrls,
      );
      expectRejectedReaderSummaryContentAbsent();
      expect(openedUrls, isNot(contains(excludedRedditUrl)));
    },
    timeout: const Timeout(Duration(minutes: 12)),
  );
}
