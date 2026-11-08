import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_captured_source.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_unpublished_posts_sliver.dart';
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_period_shell.dart';

import '../../support/reader_posts_browse_test_catalog.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  testWidgets('desktop visual fixture of 7 November missing-summary page', (
    tester,
  ) async {
    await _captureFallbackFixture(
      tester,
      width: 1280,
      height: 900,
      day: 7,
      filename: 'november-07-desktop.png',
    );
  });

  testWidgets('mobile visual fixture of 8 November missing-summary page', (
    tester,
  ) async {
    await _captureFallbackFixture(
      tester,
      width: 390,
      height: 1100,
      day: 8,
      filename: 'november-08-mobile.png',
    );
  });
}

Future<void> _captureFallbackFixture(
  WidgetTester tester, {
  required double width,
  required double height,
  required int day,
  required String filename,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final period = SummaryPeriodPreset.daily.resolveForCalendarDate(
    DateTime(2026, 11, day),
    now: DateTime.utc(2026, 11, 9, 12),
  );
  final catalog = ControlledReaderPostCatalog();
  final store = catalog.createStore();
  addTearDown(store.dispose);
  final theme = AppTheme.light();

  await tester.pumpWidget(
    AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: RepaintBoundary(
            key: const ValueKey('source-only-screenshot'),
            child: ColoredBox(
              color: theme.scaffoldBackgroundColor,
              child: CustomScrollView(
                slivers: [
                SliverToBoxAdapter(
                  child: WorkspaceSummaryPeriodShell(
                    selectedPeriod: period,
                    selectedPreset: SummaryPeriodPreset.daily,
                    availableSummaryPeriods: const [],
                    canNavigateToPreviousPeriod: true,
                    canNavigateToNextPeriod: true,
                    onPeriodChanged: (_) {},
                    onPreviousPeriod: () {},
                    onNextPeriod: () {},
                    onCalendarDateSelected: (_) {},
                    allowUnpublishedDates: true,
                    isGenerating: false,
                    exportSummary: null,
                    contentPadding: const EdgeInsets.all(AppSpacing.md),
                    child: const AppInlineProblem(
                      title: 'No AI summary for this day',
                      message: 'Showing collected original posts below, ordered '
                          'by likes or source score. No AI-generated headlines '
                          'or descriptions.',
                      tone: AppProblemTone.neutral,
                    ),
                  ),
                ),
                ReaderSummaryUnpublishedPostsSliver(
                  store: store,
                  period: period,
                  contentPadding: const EdgeInsets.all(AppSpacing.md),
                  onOpenUrl: (_) {},
                ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  expect(catalog.queries, hasLength(1));
  catalog.responses.single.complete(
    Result.success(
      ReaderPostsPage(
        items: [_xPost, _redditPost, _hnPost],
        total: 3,
        providerKeys: const ['x-twitter', 'reddit', 'hacker_news'],
      ),
    ),
  );
  await tester.pumpAndSettle();

  expect(find.text('No AI summary for this day'), findsOneWidget);
  expect(find.text('Top posts by likes'), findsOneWidget);
  expect(tester.takeException(), isNull);

  if (Platform.environment['CAPTURE_READER_FALLBACK'] == '1') {
    await expectLater(
      find.byKey(const ValueKey('source-only-screenshot')),
      matchesGoldenFile('reader-fallback-visuals/$filename'),
    );
  }
}

TopRead get _xPost => topPostFixture(
  title: 'Synthetic title never rendered',
  summary: 'AI description never rendered',
  providerKey: 'x-twitter',
  storyClusterId: 'source:x-visual',
  canonicalUrl: 'https://x.com/example/status/123',
  capturedSource: const ReaderCapturedSource(
    title: 'Synthetic title never rendered',
    body: 'Just shipped a small open-source CLI update. Faster startup, '
        'simpler configuration, and better support for developers.',
    captureAvailability: ReaderCaptureAvailability.available,
    reviewAvailability: ReaderSourceReviewAvailability.bodyPresent,
  ),
  providerMetrics: const [ProviderMetric(label: 'Likes', value: '1420')],
);

TopRead get _redditPost => topPostFixture(
  title: 'Synthetic title never rendered',
  summary: 'AI description never rendered',
  providerKey: 'reddit',
  storyClusterId: 'source:reddit-visual',
  canonicalUrl: 'https://www.reddit.com/r/opensource/comments/test',
  capturedSource: const ReaderCapturedSource(
    title: 'A practical guide to running open-source AI tools locally',
    body: 'Benchmarks and notes from testing small models and developer '
        'agents on a laptop, including memory usage and startup latency.',
    captureAvailability: ReaderCaptureAvailability.available,
    reviewAvailability: ReaderSourceReviewAvailability.bodyPresent,
  ),
  providerMetrics: const [ProviderMetric(label: 'Score', value: '860')],
);

TopRead get _hnPost => topPostFixture(
  title: 'Synthetic title never rendered',
  summary: 'AI description never rendered',
  providerKey: 'hacker_news',
  storyClusterId: 'source:hn-visual',
  canonicalUrl: 'https://news.ycombinator.com/item?id=100',
  capturedSource: const ReaderCapturedSource(
    title: 'Show HN: A lightweight workflow orchestrator',
    body: 'A tiny self-hosted service for scheduling and inspecting '
        'development workflows.',
    captureAvailability: ReaderCaptureAvailability.available,
    reviewAvailability: ReaderSourceReviewAvailability.bodyPresent,
  ),
  providerMetrics: const [ProviderMetric(label: 'Points', value: '420')],
);
