import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_post_promotion_attestation_verifier.dart';

import '../../support/reader_post_promotion_v3_attestation_fixture.dart';
import '../../support/reader_promotion_comparator_fixture.dart';

void main() {
  test('accepts a News without rating attestation from RSS', () {
    final fixture = publicV3DisplayFixture(providerKey: 'rss');
    final body = _newsBody(fixture);

    final verified = verifyV3Attestation(body, fixture, cardSignalScore: 0);

    expect(verified, isA<Object>());
    expect(
      verifyV3Attestation(body, fixture, cardSignalScore: 0.5),
      isNull,
      reason: 'a news card has no rating, so any Signal is forged',
    );
  });

  test('rejects the previous policy stamp and the old comparator shape', () {
    final fixture = publicV3DisplayFixture();
    final seal = fixture['seal']! as Map<String, Object?>;

    expect(
      verifyV3Attestation(
        v3AttestationBody(seal, policyVersion: 'reader_post_promotion.v3'),
        fixture,
      ),
      isNull,
    );
    expect(
      verifyV3Attestation(
        v3AttestationBody(seal),
        fixture,
        transportPolicyVersion: 'reader_post_promotion.v3',
      ),
      isNull,
    );
    final legacyComparator = v3AttestationBody(
      seal,
      comparator: {
        'usefulness': 'useful',
        'relevance': 'central',
        'publishedAt': v3PublishedAt,
        'candidateId': v3CandidateId,
      },
    );
    expect(verifyV3Attestation(legacyComparator, fixture), isNull);
  });

  test('derives the block from the source registry, not from the payload', () {
    final rssFixture = publicV3DisplayFixture(providerKey: 'rss');
    final redditFixture = publicV3DisplayFixture();

    final rssAsRanked = v3AttestationBody(
      rssFixture['seal']! as Map<String, Object?>,
      provider: 'rss',
      comparator: rankedComparatorJson(
        candidateId: v3CandidateId,
        publishedAt: v3PublishedAt,
        providerFamily: 'rss',
      ),
    );
    expect(
      verifyV3Attestation(rssAsRanked, rssFixture, cardSignalScore: 0),
      isNull,
    );

    final redditInNews = v3AttestationBody(
      redditFixture['seal']! as Map<String, Object?>,
      placement: 'news',
    );
    expect(verifyV3Attestation(redditInNews, redditFixture), isNull);
  });

  test('recomputes metric maturity and popularity presence', () {
    final fixture = publicV3DisplayFixture();
    final seal = fixture['seal']! as Map<String, Object?>;

    final immature = v3AttestationBody(
      seal,
      comparator: rankedComparatorJson(
        candidateId: v3CandidateId,
        publishedAt: v3PublishedAt,
        popularity: const ReaderPromotionCountsFixture(10, 9, 1),
        observedAfter:
            const Duration(hours: 6) - const Duration(microseconds: 1),
      ),
    );
    expect(verifyV3Attestation(immature, fixture), isNull);

    final unknownMetric = v3AttestationBody(
      seal,
      comparator: rankedComparatorJson(
        candidateId: v3CandidateId,
        publishedAt: v3PublishedAt,
      ),
    );
    expect(
      verifyV3Attestation(unknownMetric, fixture, cardSignalScore: 0),
      isNotNull,
    );
    final unknownWithSignal = verifyV3Attestation(
      unknownMetric,
      fixture,
      cardSignalScore: 5,
    );
    expect(
      unknownWithSignal,
      isNull,
      reason: 'an unknown metric shows Signal 0',
    );

    final popularityWithoutMaturity = copyJson(defaultRankedComparator())
      ..['metricMature'] = false;
    expect(
      verifyV3Attestation(
        v3AttestationBody(seal, comparator: popularityWithoutMaturity),
        fixture,
      ),
      isNull,
    );
  });

  test('applies the minimum popularity cohort of five', () {
    final fixture = publicV3DisplayFixture();
    final seal = fixture['seal']! as Map<String, Object?>;
    // Mature metric, but the family has fewer than five mature posts.
    final matureWithoutPopularity = copyJson(defaultRankedComparator())
      ..['popularity'] = null;
    final smallCohort = copyJson(defaultRankedComparator())
      ..['popularity'] = const ReaderPromotionCountsFixture(4, 3, 1).toJson();

    expect(
      verifyV3Attestation(
        v3AttestationBody(seal, comparator: matureWithoutPopularity),
        fixture,
        cardSignalScore: 0,
      ),
      isNotNull,
    );
    expect(
      verifyV3Attestation(
        v3AttestationBody(seal, comparator: smallCohort),
        fixture,
        cardSignalScore: 8.75,
      ),
      isNull,
    );
  });

  test('binds the card Signal exactly to the signed percentile', () {
    final fixture = publicV3DisplayFixture();
    final body = v3AttestationBody(fixture['seal']! as Map<String, Object?>);

    expect(verifyV3Attestation(body, fixture, cardSignalScore: 9.5), isNotNull);
    expect(verifyV3Attestation(body, fixture, cardSignalScore: 9.6), isNull);
    expect(verifyV3Attestation(body, fixture, cardSignalScore: null), isNull);
  });

  test('rejects a publisher claim outside news.google.com', () {
    final fixture = publicV3DisplayFixture(providerKey: 'rss');
    final body = _newsBody(fixture, newsPublisher: 'reuters');

    expect(verifyV3Attestation(body, fixture, cardSignalScore: 0), isNull);
  });

  test('rejects fractional counts and unexpected comparator keys', () {
    final fixture = publicV3DisplayFixture();
    final seal = fixture['seal']! as Map<String, Object?>;
    final fractional = copyJson(defaultRankedComparator())
      ..['popularity'] = {'cohortSize': 10, 'below': 8.5, 'equal': 1};
    final extraKey = copyJson(defaultRankedComparator())..['score'] = 0.77;

    for (final comparator in [fractional, extraKey]) {
      expect(
        verifyV3Attestation(
          v3AttestationBody(seal, comparator: comparator),
          fixture,
        ),
        isNull,
      );
    }
  });

  test('serializes integral metrics like JavaScript in canonical bytes', () {
    final fixture = publicV3DisplayFixture();
    // A decoder may hand the metric over as 984.0; the backend signed 984.
    final comparator = copyJson(defaultRankedComparator());
    (comparator['engagement']! as Map<String, Object?>)['value'] = 984.0;
    final body = v3AttestationBody(
      fixture['seal']! as Map<String, Object?>,
      comparator: comparator,
    );
    final javascriptBytes = canonicalV3Json(
      v3AttestationBody(fixture['seal']! as Map<String, Object?>),
    );

    expect(javascriptBytes, contains('"value":984}'));
    expect(
      verifyV3Attestation(body, fixture, canonicalPayload: javascriptBytes),
      isNotNull,
    );
  });

  test('keeps the policy stamp constant aligned with the backend', () {
    expect(readerPromotionPolicyStamp, 'reader_promotion.2026-11-01');
  });
}

Map<String, Object?> _newsBody(
  Map<String, Object?> fixture, {
  String? newsPublisher,
}) => v3AttestationBody(
  fixture['seal']! as Map<String, Object?>,
  placement: 'news',
  provider: 'rss',
  comparator: newsComparatorJson(
    candidateId: v3CandidateId,
    publishedAt: v3PublishedAt,
    newsPublisher: newsPublisher,
  ),
);
