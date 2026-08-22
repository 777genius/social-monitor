import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_summary_content_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../infrastructure/mappers/support/reader_summary_additional_stories_transport_fixture.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('one malformed promotion card hides the entire shared board', (
    tester,
  ) async {
    const restMapper = ReaderSummaryContentRestMapper();
    const summaryMapper = SummaryMapper();
    final summary = summaryMapper.readerSummaryToDomain(
      readerSummaryApiDto(
        id: additionalStoriesTransportArtifactId,
        topStories: const [],
        storyClusterIds: additionalStoriesTransportClusterIds,
        storyClusterAuthorities: additionalStoriesTransportClusterAuthorities,
        content: restMapper.map(
          additionalStoriesReaderBriefTransportFixture(),
          binding: additionalStoriesTransportBinding,
        ),
        citations: additionalStoriesTransportCitations,
        period: additionalStoriesTransportPeriod,
        sourceWindow: additionalStoriesTransportSourceWindow,
      ),
    );

    expect(summary.topStories, isEmpty);
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
    expect(readerSummaryTopPostsProjection(summary).items, isEmpty);
    String? openedUrl;
    await tester.pumpWidget(
      _TestApp(summary: summary, onOpenUrl: (url) => openedUrl = url),
    );
    await tester.pumpAndSettle();

    expect(find.text('Additional stories'), findsOneWidget);
    expect(find.text('Legacy editorial read'), findsNothing);
    expect(find.text('Cursor background agents launch'), findsNothing);
    expect(find.text('Official watermark standard ships'), findsNothing);
    expect(
      find.text('Does Claude Code leave watermarks inside codes?'),
      findsNothing,
    );
    expect(find.text('Related topic'), findsNothing);
    expect(
      find.bySemanticsLabel(
        'Related topic: Does Claude Code leave watermarks inside codes?',
      ),
      findsNothing,
    );
    expect(find.text('Which editor should I use for agents?'), findsNothing);
    expect(find.textContaining('Signal '), findsNothing);
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-sort')),
      findsNothing,
    );
    expect(openedUrl, isNull);
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
      findsNothing,
    );
    expect(find.text('fixture-labs/transport-repo-1'), findsNothing);
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-sort')),
      findsNothing,
    );
    expect(find.text('Sorted by usefulness'), findsNothing);
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.summary, required this.onOpenUrl});

  final ReaderSummary summary;
  final ValueChanged<String> onOpenUrl;

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
              ReaderSummaryTopPostsSliver(
                projection: readerSummaryTopPostsProjection(summary),
                selectedPostCount: summary.content.selectedPosts.length,
                period: summary.period,
                citationsById: {
                  for (final citation in summary.citations)
                    citation.id: citation,
                },
                ratingFor: null,
                onRated: null,
                onOpenUrl: onOpenUrl,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
