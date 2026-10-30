import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/policies/reader_promotion_news_publisher_policy.dart';
import 'package:social_monitor_summaries/src/domain/policies/reader_promotion_ranking_policy.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_comparator.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_popularity.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_score.dart';

import '../../support/reader_promotion_domain_fixture.dart';

void main() {
  group('hybrid score', () {
    test('reproduces the backend reference fractions exactly', () {
      // Literals from reader-promotion-score.spec.ts: the shared contract.
      _expectFraction(
        _score(ReaderPromotionUsefulness.important, (10, 0, 1)),
        8600000,
        20000000,
      );
      _expectFraction(
        _score(ReaderPromotionUsefulness.useful, null),
        400000,
        2000000,
      );
      _expectFraction(
        _score(ReaderPromotionUsefulness.useful, (3, 0, 2)),
        2400000,
        6000000,
      );
    });

    test('ties an important unknown metric with a useful 1/3 percentile', () {
      final importantUnknown = _score(
        ReaderPromotionUsefulness.important,
        null,
      );
      final usefulThird = _score(ReaderPromotionUsefulness.useful, (3, 0, 2));

      // Both are exactly 0.4; a double comparison could drift either way.
      expect(importantUnknown.compareDescending(usefulThird), 0);
      expect(
        usefulThird.compareDescending(
          _score(ReaderPromotionUsefulness.useful, (3, 2, 1)),
        ),
        greaterThan(0),
      );
      // The tie falls through to recency.
      expect(
        compareRankedReaderPromotion(
          rankedComparator(
            'a',
            usefulness: ReaderPromotionUsefulness.important,
            publishedAt: '2026-10-28T08:00:00.000000Z',
          ),
          rankedComparator(
            'b',
            counts: (3, 0, 2),
            publishedAt: '2026-10-28T08:00:00.000001Z',
          ),
        ),
        greaterThan(0),
      );
    });

    test('stays exact for cohorts beyond double-safe products', () {
      final left = _score(ReaderPromotionUsefulness.useful, (
        900000,
        450000,
        1,
      ));
      final right = _score(ReaderPromotionUsefulness.useful, (
        900001,
        450000,
        1,
      ));

      expect(left.compareDescending(right), lessThan(0));
    });

    test('fails closed on a gate-rejected usefulness or impossible counts', () {
      expect(
        ReaderPromotionScore.tryCreate(
          usefulness: ReaderPromotionUsefulness.context,
          popularity: null,
        ),
        isNull,
      );
      expect(
        ReaderPromotionScore.tryCreate(
          usefulness: ReaderPromotionUsefulness.useful,
          popularity: const ReaderPromotionPopularity(
            cohortSize: 2,
            below: 2,
            equal: 1,
          ),
        ),
        isNull,
      );
    });
  });

  test('orders the ADR example: useful 984 over important 0 over unknown', () {
    final useful984 = rankedComparator('a', counts: (10, 9, 1), metric: 984);
    final important0 = rankedComparator(
      'b',
      usefulness: ReaderPromotionUsefulness.important,
      counts: (10, 0, 1),
      metric: 0,
    );
    final importantUnknown = rankedComparator(
      'c',
      usefulness: ReaderPromotionUsefulness.important,
    );
    final ordered = [importantUnknown, important0, useful984]
      ..sort(compareRankedReaderPromotion);

    expect(ordered.map((value) => value.candidateId), ['a', 'b', 'c']);
  });

  test('breaks equal scores by newest publishedAt, then UTF-8 bytes', () {
    final older = rankedComparator(
      'a',
      publishedAt: '2026-10-28T08:00:00.000000Z',
    );
    final newer = rankedComparator(
      'b',
      publishedAt: '2026-10-28T08:00:00.000001Z',
    );
    expect(compareRankedReaderPromotion(newer, older), lessThan(0));

    // U+FF5E sorts before U+1F600 by UTF-16 units, after it by UTF-8 bytes.
    expect('\u{ff5e}'.compareTo('\u{1f600}'), greaterThan(0));
    expect(compareReaderPromotionUtf8('\u{ff5e}', '\u{1f600}'), lessThan(0));
  });

  test('orders news by usefulness, then recency, never by popularity', () {
    final useful = newsComparator(
      'a',
      publishedAt: '2026-10-28T09:00:00.000000Z',
    );
    final important = newsComparator(
      'b',
      usefulness: ReaderPromotionUsefulness.important,
      publishedAt: '2026-10-28T07:00:00.000000Z',
    );

    expect(compareUnrankedReaderPromotion(important, useful), lessThan(0));
  });

  test('treats a metric as mature from exactly six hours', () {
    final mature = rankedComparator(
      'a',
      counts: (5, 4, 1),
      observedAfter: const Duration(hours: 6),
    );
    final immature = rankedComparator(
      'b',
      counts: (5, 4, 1),
      observedAfter: const Duration(hours: 6) - const Duration(microseconds: 1),
    );

    expect(readerPromotionComparatorIsCoherent(mature), isTrue);
    expect(readerPromotionComparatorIsCoherent(immature), isFalse);
  });

  test('gives no popularity to a family below the minimum cohort', () {
    expect(readerPromotionMinPopularityCohort, 5);
    // Four mature posts: the metric is mature, but the percentile is noise.
    expect(
      readerPromotionComparatorIsCoherent(
        rankedComparator('a', counts: (4, 3, 1)),
      ),
      isFalse,
    );
    final matureWithoutPopularity = ReaderPromotionComparator(
      block: ReaderPromotionBlock.ranked,
      providerFamily: 'hacker_news',
      usefulness: ReaderPromotionUsefulness.useful,
      relevance: ReaderPromotionRelevance.central,
      engagement: rankedComparator('b', counts: (5, 4, 1)).engagement,
      metricMature: true,
      popularity: null,
      newsPublisher: null,
      publishedAt: exactTimestamp('2026-10-28T08:00:00.000000Z'),
      candidateId: 'b',
    );
    expect(
      readerPromotionComparatorIsCoherent(matureWithoutPopularity),
      isTrue,
    );
    expect(readerPromotionCardSignalScore(matureWithoutPopularity), 0);
  });

  test('derives the card Signal like Number(value.toFixed(3))', () {
    expect(
      readerPromotionCardSignalScore(rankedComparator('a', counts: (10, 9, 1))),
      9.5,
    );
    expect(
      readerPromotionCardSignalScore(rankedComparator('b', counts: (3, 0, 2))),
      3.333,
    );
    expect(readerPromotionCardSignalScore(rankedComparator('c')), 0);
    expect(readerPromotionCardSignalScore(newsComparator('d')), 0);
  });

  test('reads the Google News publisher from the title suffix only', () {
    const googleNews = 'https://news.google.com/rss/articles/x';

    expect(
      readerPromotionNewsPublisher(
        canonicalIdentity: googleNews,
        title: 'Chips   tighten - Reuters ',
      ),
      'reuters',
    );
    expect(
      readerPromotionNewsPublisher(
        canonicalIdentity: googleNews,
        title: 'Chips',
      ),
      isNull,
    );
    expect(
      readerPromotionNewsPublisher(
        canonicalIdentity: 'https://example.com/a',
        title: 'Chips - Reuters',
      ),
      isNull,
    );
  });
}

ReaderPromotionScore _score(
  ReaderPromotionUsefulness usefulness,
  (int, int, int)? counts,
) => ReaderPromotionScore.tryCreate(
  usefulness: usefulness,
  popularity: counts == null
      ? null
      : ReaderPromotionPopularity(
          cohortSize: counts.$1,
          below: counts.$2,
          equal: counts.$3,
        ),
)!;

void _expectFraction(
  ReaderPromotionScore score,
  int numerator,
  int denominator,
) {
  expect(score.numerator, BigInt.from(numerator));
  expect(score.denominator, BigInt.from(denominator));
}
