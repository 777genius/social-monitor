import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/policies/reader_promotion_board_policy.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_comparator.dart';

import '../../support/reader_promotion_domain_fixture.dart';

void main() {
  test('accepts a full board from one network: there is no family cap', () {
    final ranked = _rankedSequence(48);

    expect(
      readerPromotionBoardIsConsistent(
        top: ranked.sublist(0, 12),
        additional: ranked.sublist(12),
        news: _news(16),
      ),
      isTrue,
    );
  });

  test('rejects lane sizes outside the published limits', () {
    final ranked = _rankedSequence(49);

    expect(_valid(top: ranked.sublist(0, 13)), isFalse);
    expect(
      _valid(top: ranked.sublist(0, 12), additional: ranked.sublist(12)),
      isFalse,
    );
    // Show more continues Top and can only exist behind a full Top.
    expect(
      _valid(top: ranked.sublist(0, 11), additional: ranked.sublist(11, 12)),
      isFalse,
    );
    expect(_valid(news: _news(17)), isFalse);
  });

  test('checks Top and Show more as one ranked sequence', () {
    final ranked = _rankedSequence(13);
    final swapped = [...ranked.sublist(0, 11), ranked[12], ranked[11]];

    expect(
      _valid(top: ranked.sublist(0, 12), additional: [ranked[12]]),
      isTrue,
    );
    expect(
      _valid(top: swapped.sublist(0, 12), additional: [swapped[12]]),
      isFalse,
    );
  });

  test('rejects a forged order inside the news block', () {
    final useful = boardEntry(newsComparator('a'));
    final important = boardEntry(
      newsComparator('b', usefulness: ReaderPromotionUsefulness.important),
    );

    expect(_valid(news: [important, useful]), isTrue);
    expect(_valid(news: [useful, important]), isFalse);
  });

  test('keeps blocks apart and one story per page', () {
    final ranked = boardEntry(rankedComparator('a', counts: (5, 4, 1)));
    final news = boardEntry(newsComparator('b'));

    expect(_valid(top: [ranked]), isTrue);
    expect(_valid(top: [news]), isFalse);
    expect(_valid(news: [ranked]), isFalse);
    expect(
      _valid(
        top: [ranked],
        news: [boardEntry(newsComparator('b'), storyId: ranked.storyId)],
      ),
      isFalse,
    );
    expect(
      _valid(
        news: [
          boardEntry(newsComparator('c', publisher: 'reuters')),
          boardEntry(
            newsComparator(
              'd',
              publisher: 'reuters',
              publishedAt: '2026-10-28T07:00:00.000000Z',
            ),
          ),
        ],
      ),
      isFalse,
    );
  });

  test('keeps the minimum popularity cohort uniform per family', () {
    final withPopularity = boardEntry(
      rankedComparator('a', counts: (5, 4, 1), metric: 50),
    );
    final mature = withPopularity.comparator;
    final withoutPopularity = boardEntry(
      ReaderPromotionComparator(
        block: mature.block,
        providerFamily: mature.providerFamily,
        usefulness: mature.usefulness,
        relevance: mature.relevance,
        engagement: mature.engagement,
        metricMature: true,
        popularity: null,
        newsPublisher: null,
        publishedAt: mature.publishedAt,
        candidateId: 'b',
      ),
    );

    // A family below the minimum cohort is fine on its own ...
    expect(_valid(top: [withoutPopularity]), isTrue);
    // ... but one family cannot be both below and above the minimum.
    expect(_valid(top: [withPopularity, withoutPopularity]), isFalse);
  });

  test('rejects incoherent maturity and popularity cohorts', () {
    final immature = boardEntry(
      rankedComparator(
        'a',
        counts: (5, 4, 1),
        observedAfter: const Duration(hours: 5),
      ),
    );
    expect(_valid(top: [immature]), isFalse);

    // The larger metric claims fewer posts below it than the smaller one.
    final strong = boardEntry(
      rankedComparator('b', counts: (5, 0, 1), metric: 900),
    );
    final weak = boardEntry(
      rankedComparator('c', counts: (5, 1, 1), metric: 3),
    );
    expect(_valid(top: [weak]), isTrue);
    expect(_valid(top: [weak, strong]), isFalse);

    // Ordered correctly (0.38 before 0.35), but the family has two sizes.
    final cohortMismatch = boardEntry(
      rankedComparator('d', counts: (6, 1, 1), metric: 3),
    );
    expect(_valid(top: [weak, cohortMismatch]), isFalse);
  });
}

bool _valid({
  List<ReaderPromotionBoardEntry> top = const [],
  List<ReaderPromotionBoardEntry> additional = const [],
  List<ReaderPromotionBoardEntry> news = const [],
}) => readerPromotionBoardIsConsistent(
  top: top,
  additional: additional,
  news: news,
);

/// Distinct mature Reddit metrics, strongest first: one valid sequence.
List<ReaderPromotionBoardEntry> _rankedSequence(int count) => [
  for (var index = 0; index < count; index += 1)
    boardEntry(
      rankedComparator(
        'ranked-${index.toString().padLeft(2, '0')}',
        counts: (count, count - 1 - index, 1),
        metric: (count - index).toDouble(),
      ),
    ),
];

List<ReaderPromotionBoardEntry> _news(int count) => [
  for (var index = 0; index < count; index += 1)
    boardEntry(
      newsComparator(
        'news-${index.toString().padLeft(2, '0')}',
        publishedAt:
            '2026-10-27T${(23 - index).toString().padLeft(2, '0')}:00:00.000000Z',
      ),
    ),
];
