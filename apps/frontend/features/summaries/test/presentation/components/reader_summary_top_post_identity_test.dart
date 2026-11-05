import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('keeps a story key through filtering and backend reordering', (
    tester,
  ) async {
    final original = _summary(reversed: false);
    const storyKey = ValueKey(
      'reader-summary-top-post-cluster:story:stable-hn',
    );

    await tester.pumpWidget(_TestApp(summary: original));
    await tester.pumpAndSettle();
    expect(find.byKey(storyKey), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-filters')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hacker News').last);
    await tester.pumpAndSettle();
    expect(find.byKey(storyKey), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-filters')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hacker News').last);
    await tester.pumpAndSettle();
    expect(find.byKey(storyKey), findsOneWidget);

    await tester.pumpWidget(_TestApp(summary: _summary(reversed: true)));
    await tester.pumpAndSettle();
    expect(find.byKey(storyKey), findsOneWidget);
  });
}

ReaderSummary _summary({required bool reversed}) {
  const hackerNews = TopReadApiDto(
    storyClusterId: 'story:stable-hn',
    cardKind: 'curated_top_read',
    promotionAttestation: ReaderPostPromotionAttestationApiDto(
      candidateId: 'feed:stable-hn',
      canonicalIdentity: 'story:stable-hn',
      placement: 'top',
      slot: 0,
      decision: 'promote_top',
    ),
    title: 'Stable Hacker News story',
    providerKey: 'hacker-news',
    reason: 'Stable identity regression fixture.',
    matchedInterestIds: ['ai-developer-tools'],
    signalScore: 1,
    providerMetrics: [ProviderMetricApiDto(label: 'Points', value: '18')],
    citationIds: ['stable-hn-citation'],
  );
  const reddit = TopReadApiDto(
    storyClusterId: 'story:stable-reddit',
    cardKind: 'curated_top_read',
    promotionAttestation: ReaderPostPromotionAttestationApiDto(
      candidateId: 'feed:stable-reddit',
      canonicalIdentity: 'story:stable-reddit',
      placement: 'top',
      slot: 0,
      decision: 'promote_top',
    ),
    title: 'Stable Reddit story',
    providerKey: 'reddit',
    reason: 'Reordering regression fixture.',
    matchedInterestIds: ['ai-developer-tools'],
    signalScore: 2,
    providerMetrics: [ProviderMetricApiDto(label: 'Comments', value: '42')],
    citationIds: ['stable-reddit-citation'],
  );
  final topReads = reversed ? [reddit, hackerNews] : [hackerNews, reddit];
  return const SummaryMapper().readerSummaryToDomain(
    readerSummaryApiDto(
      content: readerSummaryContentApiDto(topReads: topReads),
      citations: [
        summaryCitationApiDto(
          id: 'stable-hn-citation',
          providerKey: 'hacker-news',
        ),
        summaryCitationApiDto(
          id: 'stable-reddit-citation',
          providerKey: 'reddit',
        ),
      ],
    ),
  );
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
          body: ReaderSummaryTopPosts(
            projection: readerSummaryTopPostsProjection(summary),
            selectedPostCount: summary.content.topReads.length,
            period: summary.period,
            citationsById: {
              for (final citation in summary.citations) citation.id: citation,
            },
            ratingFor: null,
            onRated: null,
            onOpenUrl: (_) {},
          ),
        ),
      ),
    );
  }
}
