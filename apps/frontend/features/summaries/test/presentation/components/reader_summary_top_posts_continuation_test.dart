import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_top_posts_section_sliver.dart';

import '../../support/top_posts_test_fixtures.dart';

void main() {
  testWidgets('starts at eight and reveals two automatic batches on scroll', (
    tester,
  ) async {
    _configureView(tester);
    final summary = _continuationSummary();

    await tester.pumpWidget(_TopPostsTestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(find.text('Curated 0'), findsOneWidget);
    expect(find.text('Continuation 0'), findsNothing);
    expect(find.textContaining('Load more'), findsNothing);
    expect(_topPostSliverChildCount(tester), 16);

    await tester.scrollUntilVisible(
      find.text('Continuation 2'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();

    expect(find.text('Continuation 2'), findsOneWidget);
    expect(_topPostSliverChildCount(tester), 64);

    await tester.scrollUntilVisible(
      find.text('Continuation 28'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();

    expect(find.text('Continuation 28'), findsOneWidget);
    expect(_topPostSliverChildCount(tester), 112);
  });

  testWidgets('does not reveal a visible sentinel before user scroll', (
    tester,
  ) async {
    _configureView(tester, height: 6000);

    await tester.pumpWidget(_TopPostsTestApp(summary: _continuationSummary()));
    await tester.pumpAndSettle();

    expect(_topPostSliverChildCount(tester), 16);
    expect(find.text('Continuation 0'), findsNothing);
  });

  testWidgets('keeps selected continuation reachable with zero top reads', (
    tester,
  ) async {
    _configureView(tester);
    final summary = topPostsSummaryFixture(
      topReads: const [],
      selectedPosts: [
        for (var index = 0; index < 12; index += 1)
          topPostFixture(title: 'Selected $index'),
      ],
    );

    await tester.pumpWidget(_TopPostsTestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(_topPostSliverChildCount(tester), 16);
    expect(find.text('Selected 8'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Selected 8'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();

    expect(find.text('Selected 8'), findsOneWidget);
    expect(_topPostSliverChildCount(tester), 23);
  });

  testWidgets('dedupes top reads while filling eight unique initial posts', (
    tester,
  ) async {
    _configureView(tester);
    final summary = topPostsSummaryFixture(
      topReads: [
        topPostFixture(
          title: 'Curated 0',
          canonicalUrl: 'https://news.example/curated/0',
        ),
        topPostFixture(
          title: 'Duplicate inside top reads',
          canonicalUrl: 'https://news.example/curated/0/',
        ),
        for (var index = 1; index < 3; index += 1)
          topPostFixture(
            title: 'Curated $index',
            canonicalUrl: 'https://news.example/curated/$index',
          ),
      ],
      selectedPosts: [
        topPostFixture(
          title: 'Duplicate curated',
          canonicalUrl: 'https://news.example/curated/0/',
        ),
        for (var index = 0; index < 9; index += 1)
          topPostFixture(title: 'Selected $index'),
      ],
    );

    await tester.pumpWidget(_TopPostsTestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(_topPostSliverChildCount(tester), 16);
    expect(find.text('Duplicate inside top reads'), findsNothing);
    expect(find.text('Selected 5'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Selected 8'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();

    expect(find.text('Selected 8'), findsOneWidget);
    expect(_topPostSliverChildCount(tester), 23);
  });

  testWidgets('keeps continuation on an equivalent dataset rebuild', (
    tester,
  ) async {
    _configureView(tester);

    await tester.pumpWidget(_TopPostsTestApp(summary: _continuationSummary()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Continuation 2'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();
    expect(_topPostSliverChildCount(tester), 64);

    await tester.pumpWidget(_TopPostsTestApp(summary: _continuationSummary()));
    await tester.pumpAndSettle();

    expect(find.text('Continuation 2'), findsOneWidget);
    expect(_topPostSliverChildCount(tester), 64);
    expect(tester.takeException(), isNull);
  });

  testWidgets('resets continuation when the summary period changes', (
    tester,
  ) async {
    _configureView(tester);

    await tester.pumpWidget(_TopPostsTestApp(summary: _continuationSummary()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Continuation 2'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();
    expect(_topPostSliverChildCount(tester), 64);

    await tester.scrollUntilVisible(
      find.text('Curated 0'),
      -420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();
    await tester.pumpWidget(
      _TopPostsTestApp(
        summary: _continuationSummary(
          period: SummaryPeriod(
            cadence: SummaryPeriodCadence.daily,
            startedAt: DateTime.utc(2026, 6, 27),
            endedAt: DateTime.utc(2026, 6, 28),
            timezone: 'UTC',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(_topPostSliverChildCount(tester), 16);
  });
}

int _topPostSliverChildCount(WidgetTester tester) {
  final sliver = tester.widget<SliverList>(find.byType(SliverList));
  return sliver.delegate.estimatedChildCount!;
}

ReaderSummary _continuationSummary({SummaryPeriod? period}) {
  return topPostsSummaryFixture(
    topReads: [
      for (var index = 0; index < 8; index += 1)
        topPostFixture(
          title: 'Curated $index',
          canonicalUrl: 'https://news.example/curated/$index',
        ),
    ],
    selectedPosts: [
      for (var index = 0; index < 60; index += 1)
        topPostFixture(
          title: 'Continuation $index',
          canonicalUrl: 'https://news.example/continuation/$index',
        ),
    ],
    period: period,
  );
}

void _configureView(WidgetTester tester, {double height = 700}) {
  tester.view.physicalSize = Size(1100, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

class _TopPostsTestApp extends StatelessWidget {
  const _TopPostsTestApp({required this.summary});

  final ReaderSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: CustomScrollView(
            slivers: [
              ReaderSummaryTopPostsSectionSliver(
                summary: summary,
                contentPadding: const EdgeInsets.all(AppSpacing.md),
                onOpenUrl: (_) {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}
