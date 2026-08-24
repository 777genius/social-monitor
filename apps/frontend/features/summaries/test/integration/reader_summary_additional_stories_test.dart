import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/application/commands/open_reader_source_command.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../integration_test/support/additional_stories_test_scenarios.dart';
import '../../integration_test/support/reader_summary_test_boundaries.dart';
import '../infrastructure/mappers/support/additional_stories_domain_fixture.dart';

void main() {
  testWidgets(
    'keeps Additional stories isolated through the REST reader flow',
    (tester) async {
      final fixtureReader = AdditionalStoriesDomainFixtureReader();
      final launcher = RecordingReaderSourceLauncher();
      final openSource = OpenReaderSourceUseCase(launcher);
      final summary = await fixtureReader.fetch();
      final projection = readerSummaryTopPostsProjection(summary);

      expect(fixtureReader.requestCount, 1);
      expect(projection.additionalNotableStories, hasLength(2));
      expect(
        projection.additionalNotableStories.where(
          (item) => item.title == 'Cursor background agents launch',
        ),
        hasLength(1),
      );
      expect(
        projection.additionalNotableStories.where(
          (item) =>
              item.title ==
              'Anthropic publishes an official watermark standard',
        ),
        hasLength(1),
      );
      expect(
        projection.additionalNotableStories.map((item) => item.title),
        isNot(contains(redditStoryTitle)),
      );
      final redditCitation = summary.citations.singleWhere(
        (citation) => citation.id == 'watermark-reddit-citation',
      );
      expect(redditCitation.providerKey, 'reddit');
      expect(redditCitation.canonicalUrl, redditStoryUrl);

      await tester.pumpWidget(
        _AdditionalStoriesApp(
          summary: summary,
          onOpenUrl: (url) => unawaited(
            openSource(
              OpenReaderSourceCommand(
                summaryId: summary.id,
                kind: 'read_source',
                label: 'Open Reddit source',
                canonicalUrl: url,
                idempotencyKey: 'additional-stories-e2e-open',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final boardKeys = find.byWidgetPredicate((widget) {
        final key = widget.key;
        return key is ValueKey<String> &&
            key.value.startsWith('reader-summary-top-posts-board-');
      });
      expect(boardKeys, findsNWidgets(2));
      expect(find.text('Top posts'), findsOneWidget);
      expect(find.text('Additional stories'), findsOneWidget);
      expect(find.text('GitHub trends'), findsNothing);

      await tester.tap(
        find.byKey(
          const ValueKey('reader-summary-top-posts-board-additional-stories'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Cursor background agents launch'), findsOneWidget);
      expect(
        find.text('Anthropic publishes an official watermark standard'),
        findsOneWidget,
      );
      final cursorRow = find.byKey(
        const ValueKey('reader-summary-top-post-cluster:story:cursor-agents'),
      );
      expect(
        find.descendant(of: cursorRow, matching: find.text('Cross-source')),
        findsOneWidget,
      );
      final officialRow = find.byKey(
        const ValueKey(
          'reader-summary-top-post-cluster:story:watermark-official',
        ),
      );
      expect(
        find.descendant(of: officialRow, matching: find.text('Cross-source')),
        findsOneWidget,
      );

      final redditRow = find.bySemanticsLabel(
        'Related topic: $redditStoryTitle',
      );
      expect(redditRow, findsNothing);

      for (final rejectedTitle in rejectedAdditionalStoryTitles) {
        expect(find.text(rejectedTitle), findsNothing);
      }

      expect(launcher.openedUris, isEmpty);
    },
  );
}

class _AdditionalStoriesApp extends StatelessWidget {
  const _AdditionalStoriesApp({required this.summary, required this.onOpenUrl});

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
