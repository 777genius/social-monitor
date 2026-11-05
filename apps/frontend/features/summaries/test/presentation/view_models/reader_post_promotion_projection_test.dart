import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/top_posts_test_fixtures.dart';

void main() {
  test('hides markerless and placement-conflicting promotion cards', () {
    final markerlessTop = topPostFixture(
      title: 'Markerless Top',
      storyClusterId: 'cluster:markerless-top',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      attested: false,
    );
    final markerlessAdditional = topPostFixture(
      title: 'Markerless Additional',
      storyClusterId: 'cluster:markerless-additional',
      cardKind: ReaderSummaryCardKind.additionalNotableStory,
      attested: false,
    );
    final conflictingTop = topPostFixture(
      title: 'Conflicting Top',
      storyClusterId: 'cluster:conflicting-top',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      promotionAttestationOverride: const ReaderPostPromotionAttestation(
        candidateId: 'candidate-conflict',
        canonicalIdentity: 'story:conflict',
        placement: ReaderPostPromotionPlacement.additional,
        slot: 0,
        decision: 'promote_additional',
      ),
    );

    final projection = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: [markerlessTop, conflictingTop],
        selectedPosts: [markerlessAdditional],
      ),
    );

    expect(projection.curatedPosts, isEmpty);
    expect(projection.additionalNotableStories, isEmpty);
  });

  test(
    'one invalid card poisons the whole promotion board without filtering',
    () {
      final top = [
        for (var index = 0; index < 9; index += 1)
          topPostFixture(
            title: 'Top $index',
            storyClusterId: 'top:$index',
            cardKind: ReaderSummaryCardKind.curatedTopRead,
            attested: index != 0,
            promotionCanonicalIdentity: 'story:top:$index',
          ),
      ];
      final additional = [
        for (var index = 0; index < 9; index += 1)
          topPostFixture(
            title: 'Additional $index',
            storyClusterId: 'additional:$index',
            cardKind: ReaderSummaryCardKind.additionalNotableStory,
            attested: index != 0,
            promotionCanonicalIdentity: 'story:additional:$index',
          ),
      ];

      final projection = readerSummaryTopPostsProjection(
        topPostsSummaryFixture(
          topReads: top,
          selectedPosts: [...top, ...additional],
        ),
      );

      expect(projection.curatedPosts, isEmpty);
      expect(projection.additionalNotableStories, isEmpty);
      expect(projection.items, isEmpty);
    },
  );

  test('does not repeat backend canonical-selection policy', () {
    final top = topPostFixture(
      title: 'Canonical Top',
      storyClusterId: 'cluster:top',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      promotionCanonicalIdentity: 'story:same',
    );
    final duplicateTop = topPostFixture(
      title: 'Duplicate Top',
      storyClusterId: 'cluster:top-copy',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      promotionCanonicalIdentity: 'story:same',
    );
    final duplicateAdditional = topPostFixture(
      title: 'Duplicate Additional',
      storyClusterId: 'cluster:additional-copy',
      cardKind: ReaderSummaryCardKind.additionalNotableStory,
      promotionCanonicalIdentity: 'story:same',
    );
    final uniqueAdditional = topPostFixture(
      title: 'Unique Additional',
      storyClusterId: 'cluster:additional',
      cardKind: ReaderSummaryCardKind.additionalNotableStory,
      promotionCanonicalIdentity: 'story:other',
    );

    final projection = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: [top, duplicateTop],
        selectedPosts: [duplicateAdditional, uniqueAdditional],
      ),
    );

    expect(projection.curatedPosts.map((item) => item.title), [
      'Canonical Top',
      'Duplicate Top',
    ]);
    expect(projection.additionalNotableStories.map((item) => item.title), [
      'Duplicate Additional',
      'Unique Additional',
    ]);
  });

  test('accepts short and zero promotion lanes', () {
    final short = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: [
          topPostFixture(
            title: 'Only Top',
            storyClusterId: 'cluster:only',
            cardKind: ReaderSummaryCardKind.curatedTopRead,
          ),
        ],
      ),
    );
    final empty = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(topReads: const []),
    );

    expect(short.curatedPosts, hasLength(1));
    expect(short.additionalNotableStories, isEmpty);
    expect(empty.items, isEmpty);
  });
}
