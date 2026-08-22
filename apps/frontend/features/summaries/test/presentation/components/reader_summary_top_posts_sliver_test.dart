import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/summaries_test_fixtures.dart';
import '../../support/top_posts_sliver_test_fixtures.dart';

part 'reader_summary_top_posts_sliver_test_app.dart';

void main() {
  testWidgets('shows backend promotion boards and keeps Top selected', (
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
        content: readerSummaryContentApiDto(topReads: lazyTopReadApiDtos(1)),
        citations: lazyCitationApiDtos(1),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-posts')),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('reader-summary-top-posts-board-additional-stories'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
      findsNothing,
    );
    expect(find.text('Lazy top post 0'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'renders the backend-attested Additional lane without recapping',
    (tester) async {
      tester.view.physicalSize = const Size(1100, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final summary = const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(
          storyClusterIds: [
            for (var index = 0; index < 16; index += 1) 'story:lazy-$index',
          ],
          content: readerSummaryContentApiDto(
            topReads: lazyTopReadApiDtos(8),
            selectedPosts: lazyAdditionalStoryApiDtos(8, startIndex: 8),
          ),
          citations: lazyCitationApiDtos(16),
        ),
      );

      await tester.pumpWidget(_TestApp(summary: summary));
      await tester.pumpAndSettle();

      expect(find.text('Lazy top post 30'), findsNothing);

      await tester.tap(
        find.byKey(
          const ValueKey('reader-summary-top-posts-board-additional-stories'),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text('Lazy top post 15'),
        320,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();

      expect(find.text('Lazy top post 15'), findsOneWidget);
      expect(find.text('Lazy top post 16'), findsNothing);
    },
  );

  testWidgets('keeps backend-attested order without offering local reranking', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1100, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: _editorialOrderTopReads(),
        ),
        citations: lazyCitationApiDtos(3),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-sort')),
      findsNothing,
    );
    final editorialWinner = find.text('Backend editorial winner');
    final engagementWinner = find.text('Higher engagement runner-up');
    final editorialRow = find.byKey(
      const ValueKey(
        'reader-summary-top-post-cluster:story:backend-editorial-winner',
      ),
    );
    final engagementRow = find.byKey(
      const ValueKey(
        'reader-summary-top-post-cluster:story:higher-engagement-runner-up',
      ),
    );
    expect(editorialRow, findsOneWidget);
    expect(engagementRow, findsOneWidget);
    expect(
      tester.getTopLeft(editorialWinner).dy,
      lessThan(tester.getTopLeft(engagementWinner).dy),
    );

    expect(
      tester.getTopLeft(editorialWinner).dy,
      lessThan(tester.getTopLeft(engagementWinner).dy),
    );
    expect(editorialRow, findsOneWidget);
    expect(engagementRow, findsOneWidget);
  });

  testWidgets('renders the backend Additional lane separately from Top', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1100, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final editorialReads = _editorialOrderTopReads();
    final selectedPosts = [_longTailSelectedPost()];
    final content = readerSummaryContentApiDto(topReads: editorialReads);
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: _contentWithSelectedPosts(content, selectedPosts),
        citations: lazyCitationApiDtos(3),
        coverage: const ReaderSummaryCoverageApiDto(
          collectedFeedItemCount: 3,
          selectedFeedItemCount: 3,
          topReadCount: 2,
          citationCount: 2,
        ),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Top posts, 2 items'), findsOneWidget);
    expect(find.text('2 editorial picks from 3 selected'), findsOneWidget);
    expect(find.text('Backend editorial winner'), findsOneWidget);
    expect(find.text('Higher engagement runner-up'), findsOneWidget);
    expect(find.text('Long-tail selected evidence'), findsNothing);

    await tester.tap(
      find.byKey(
        const ValueKey('reader-summary-top-posts-board-additional-stories'),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.bySemanticsLabel('Additional stories, 1 items'),
      findsOneWidget,
    );
    expect(find.text('Long-tail selected evidence'), findsOneWidget);
    expect(find.text('Sorted by usefulness'), findsNothing);
  });
}

List<TopReadApiDto> _editorialOrderTopReads() => [
  const TopReadApiDto(
    storyClusterId: 'story:backend-editorial-winner',
    cardKind: 'curated_top_read',
    promotionAttestation: ReaderPostPromotionAttestationApiDto(
      candidateId: 'feed:backend-editorial-winner',
      canonicalIdentity: 'story:backend-editorial-winner',
      placement: 'top',
      slot: 0,
      decision: 'promote_top',
    ),
    title: 'Backend editorial winner',
    providerKey: 'reddit',
    reason: 'Backend ranking selected this relevant verified workflow signal.',
    matchedInterestIds: ['ai-developer-tools'],
    signalScore: 2.2,
    confidence: TopReadConfidenceApiDto(
      level: 'medium',
      score: 0.62,
      rationale: 'Relevant source evidence.',
    ),
    confirmedProviderKeys: ['reddit'],
    providerMetrics: [ProviderMetricApiDto(label: 'Likes', value: '100')],
    citationIds: ['lazy-c-0'],
  ),
  const TopReadApiDto(
    storyClusterId: 'story:higher-engagement-runner-up',
    cardKind: 'curated_top_read',
    promotionAttestation: ReaderPostPromotionAttestationApiDto(
      candidateId: 'feed:higher-engagement-runner-up',
      canonicalIdentity: 'story:higher-engagement-runner-up',
      placement: 'top',
      slot: 1,
      decision: 'promote_top',
    ),
    title: 'Higher engagement runner-up',
    providerKey: 'reddit',
    reason: 'Useful secondary evidence with higher native engagement.',
    matchedInterestIds: ['ai-developer-tools'],
    signalScore: 2.6,
    confidence: TopReadConfidenceApiDto(
      level: 'high',
      score: 0.82,
      rationale: 'Multiple source groups surfaced the item.',
    ),
    confirmedProviderKeys: ['reddit'],
    providerMetrics: [ProviderMetricApiDto(label: 'Points', value: '10,000')],
    citationIds: ['lazy-c-1'],
  ),
];

TopReadApiDto _longTailSelectedPost() => const TopReadApiDto(
  storyClusterId: 'story:long-tail',
  cardKind: 'additional_notable_story',
  promotionAttestation: ReaderPostPromotionAttestationApiDto(
    candidateId: 'feed:long-tail',
    canonicalIdentity: 'story:long-tail',
    placement: 'additional',
    slot: 0,
    decision: 'promote_additional',
  ),
  title: 'Long-tail selected evidence',
  providerKey: 'reddit',
  reason: 'Selected evidence that is not an editorial top read.',
  matchedInterestIds: ['ai-developer-tools'],
  signalScore: 1.4,
  providerMetrics: [ProviderMetricApiDto(label: 'Score', value: '25')],
  citationIds: ['lazy-c-2'],
);

ReaderSummaryContentApiDto _contentWithSelectedPosts(
  ReaderSummaryContentApiDto content,
  List<TopReadApiDto> selectedPosts,
) => ReaderSummaryContentApiDto(
  headline: content.headline,
  oneLineTakeaway: content.oneLineTakeaway,
  bullets: content.bullets,
  narrativeSections: content.narrativeSections,
  mainTopics: content.mainTopics,
  topicMap: content.topicMap,
  qualityState: content.qualityState,
  interestSections: content.interestSections,
  sourceMix: content.sourceMix,
  topReads: content.topReads,
  selectedPosts: selectedPosts,
  claimBoard: content.claimBoard,
  reliabilityReport: content.reliabilityReport,
  trendDelta: content.trendDelta,
  openQuestions: content.openQuestions,
  risks: content.risks,
  nextActions: content.nextActions,
);
