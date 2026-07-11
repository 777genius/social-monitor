import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('shows both tabs and keeps top posts selected by default', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(topReads: _topReads(1)),
        citations: _citations(1),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-posts')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
      findsOneWidget,
    );
    expect(find.text('Lazy top post 0'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Lazy top post 0'), findsNothing);
    expect(
      find.text('No GitHub Trending repositories in this summary window.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('reveals more top posts as the user scrolls', (tester) async {
    tester.view.physicalSize = const Size(1100, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(topReads: _topReads(36)),
        citations: _citations(36),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(find.text('Lazy top post 30'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Lazy top post 30'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 80,
    );
    await tester.pumpAndSettle();

    expect(find.text('Lazy top post 30'), findsOneWidget);
  });
}

List<TopReadApiDto> _topReads(int count) {
  return List<TopReadApiDto>.generate(count, (index) {
    return TopReadApiDto(
      title: 'Lazy top post $index',
      providerKey: 'reddit',
      reason: 'Post $index explains why this signal matters.',
      matchedInterestIds: const ['ai-developer-tools'],
      signalScore: (count - index).toDouble(),
      confidence: const TopReadConfidenceApiDto(
        level: 'medium',
        score: 0.55,
        rationale: 'Same-source support.',
      ),
      confirmedProviderKeys: const ['reddit'],
      providerMetrics: [
        ProviderMetricApiDto(label: 'Likes', value: '${1000 - index}'),
      ],
      citationIds: ['lazy-c-$index'],
    );
  });
}

List<SummaryCitationApiDto> _citations(int count) {
  return List<SummaryCitationApiDto>.generate(count, (index) {
    return summaryCitationApiDto(
      id: 'lazy-c-$index',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.example/post/$index',
    );
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.summary});

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
              SliverPadding(
                padding: const EdgeInsets.all(AppSpacing.md),
                sliver: ReaderSummaryTopPostsSliver(
                  items: summary.content.selectedPosts,
                  curatedTopPostCount: summary.content.topReads.length,
                  selectedPostCount: summary.content.selectedPosts.length,
                  period: summary.period,
                  citationsById: {
                    for (final citation in summary.citations)
                      citation.id: citation,
                  },
                  ratingFor: (_) => null,
                  onRated: (_, _, _) async => true,
                  onOpenUrl: (_) {},
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
