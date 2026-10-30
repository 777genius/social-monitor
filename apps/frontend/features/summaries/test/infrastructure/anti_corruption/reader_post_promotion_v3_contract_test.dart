import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import '../../support/reader_display_headline_fixture.dart';
import '../../support/reader_post_promotion_v3_attestation_fixture.dart';
import '../../support/reader_promotion_comparator_fixture.dart';

void main() {
  for (final entry in {
    'hacker-news': 'hacker_news',
    'x-twitter': 'x',
    'github-repo-radar': 'github_radar',
  }.entries) {
    test('preserves production provider identity ${entry.key}', () {
      final fixture = publicV3DisplayFixture(providerKey: entry.key);
      final body = v3AttestationBody(
        fixture['seal']! as Map<String, Object?>,
        provider: entry.key,
        comparator: rankedComparatorJson(
          candidateId: v3CandidateId,
          publishedAt: v3PublishedAt,
          providerFamily: entry.value,
          popularity: const ReaderPromotionCountsFixture(10, 9, 1),
        ),
      );
      expect(verifyV3Attestation(body, fixture), isNotNull);
    });
  }

  test('verifies nested V3 while rejecting semantic and digest tampering', () {
    final fixture = publicV3DisplayFixture();
    final body = v3AttestationBody(fixture['seal']! as Map<String, Object?>);
    expect(verifyV3Attestation(body, fixture), isNotNull);

    final legacyCutoffTamper = copyJson(body)
      ..['ingestionCutoff'] = '2026-09-21T00:00:00.124Z';
    expect(verifyV3Attestation(legacyCutoffTamper, fixture), isNull);
    final exactCutoffTamper = copyJson(body)
      ..['exactIngestionCutoff'] = '2026-09-21T00:00:00.123457Z';
    expect(verifyV3Attestation(exactCutoffTamper, fixture), isNull);

    expect(
      verifyV3Attestation(
        copyJson(body),
        fixture,
        cardPublishedAt: DateTime.parse('2026-09-20T12:00:00.123Z'),
      ),
      isNull,
    );

    final adjacent = copyJson(body);
    (adjacent['assessment']! as Map<String, Object?>)['answers'] = v3Answers(
      relevance: 'adjacent',
    );
    (adjacent['comparator']! as Map<String, Object?>)['relevance'] = 'adjacent';
    expect(verifyV3Attestation(adjacent, fixture), isNull);

    final reordered = copyJson(body)..['citationIds'] = ['citation-2'];
    expect(verifyV3Attestation(reordered, fixture), isNull);
    final inconsistentChoice = copyJson(body);
    (((inconsistentChoice['assessment']! as Map<String, Object?>)['answers']!
                as Map<String, Object?>)['usefulness']!
            as Map<String, Object?>)['choiceDiffersFromArgmax'] =
        true;
    expect(verifyV3Attestation(inconsistentChoice, fixture), isNull);
    final nonCanonicalAssessedAt = copyJson(body);
    (nonCanonicalAssessedAt['assessment']!
            as Map<String, Object?>)['assessedAt'] =
        '2026-09-20T12:01:00Z';
    expect(verifyV3Attestation(nonCanonicalAssessedAt, fixture), isNull);
    expect(
      verifyV3Attestation(body, fixture, digest: List.filled(64, '0').join()),
      isNull,
    );
  });

  test('rejects tampered V3 outer promotion lane claims', () {
    final fixture = publicV3DisplayFixture();
    final body = v3AttestationBody(fixture['seal']! as Map<String, Object?>);

    // The sealed claim remains top/promote_top. A changed outer wrapper must
    // not be reconstructed from those canonical bytes.
    expect(
      verifyV3Attestation(
        body,
        fixture,
        transportPlacement: 'additional',
        transportDecision: 'promote_additional',
      ),
      isNull,
    );
    expect(
      verifyV3Attestation(body, fixture, transportPlacement: null),
      isNull,
    );
    expect(verifyV3Attestation(body, fixture, transportDecision: null), isNull);
  });

  test('rejects a V3 card story-cluster rename without resealing', () {
    final fixture = publicV3DisplayFixture();
    final body = v3AttestationBody(fixture['seal']! as Map<String, Object?>);

    expect(
      verifyV3Attestation(body, fixture, cardStoryClusterId: 'story-renamed'),
      isNull,
    );
    expect(
      verifyV3Attestation(body, fixture, cardStoryClusterId: null),
      isNull,
    );
  });

  test('rejects missing or changed independent V3 transport bindings', () {
    final fixture = publicV3DisplayFixture();
    final body = v3AttestationBody(fixture['seal']! as Map<String, Object?>);
    final changedAssessment = copyJson(
      body['assessment']! as Map<String, Object?>,
    )..['assessmentId'] = 'changed-assessment';
    final changedComparator = copyJson(
      body['comparator']! as Map<String, Object?>,
    )..['popularity'] = const ReaderPromotionCountsFixture(10, 8, 1).toJson();

    for (final tampered in <Object? Function()>[
      () => verifyV3Attestation(body, fixture, transportProvider: null),
      () => verifyV3Attestation(body, fixture, transportProvider: 'rss'),
      () => verifyV3Attestation(body, fixture, transportStoryId: null),
      () =>
          verifyV3Attestation(body, fixture, transportStoryId: 'story-renamed'),
      () => verifyV3Attestation(body, fixture, transportPeriodStartedAt: null),
      () => verifyV3Attestation(body, fixture, transportPeriodEndedAt: null),
      () => verifyV3Attestation(body, fixture, transportIngestionCutoff: null),
      () => verifyV3Attestation(
        body,
        fixture,
        transportAssessment: changedAssessment,
      ),
      () => verifyV3Attestation(
        body,
        fixture,
        transportComparator: changedComparator,
      ),
      () => verifyV3Attestation(body, fixture, transportPresentation: null),
    ]) {
      expect(tampered(), isNull);
    }
  });

  test(
    'rejects reordered-key and whitespace V3 bytes despite matching digest',
    () {
      final fixture = publicV3DisplayFixture();
      final body = v3AttestationBody(fixture['seal']! as Map<String, Object?>);
      final reordered = <String, Object?>{
        for (final entry in body.entries.toList().reversed)
          entry.key: entry.value,
      };
      expect(
        verifyV3Attestation(
          reordered,
          fixture,
          canonicalPayload: jsonEncode(reordered),
        ),
        isNull,
      );
      expect(
        verifyV3Attestation(
          body,
          fixture,
          canonicalPayload: ' ${canonicalV3Json(body)}',
        ),
        isNull,
      );
    },
  );

  test('rejects legacy not_assessed compatibility headlines in V3', () {
    final fixture = publicV3DisplayFixture();
    final unavailable = <String, Object?>{
      'headline': <String, Object?>{
        'status': 'unavailable',
        'reasonCode': 'not_assessed',
      },
    };
    expect(
      verifyV3Attestation(v3AttestationBody(unavailable), fixture),
      isNull,
    );
  });

  test('rejects V3 plaintext interest bindings', () {
    final privateFixture = readerDisplayFixture();
    final body = v3AttestationBody(
      privateFixture['seal']! as Map<String, Object?>,
    );
    expect(verifyV3Attestation(body, privateFixture), isNull);
  });
}
