import 'package:flutter_test/flutter_test.dart';

import '../../support/reader_post_promotion_v3_attestation_fixture.dart';
import '../../support/reader_promotion_comparator_fixture.dart';

void main() {
  test(
    'V2 admits a young observed metric and V1 retains its signed meaning',
    () {
      final fixture = publicV3DisplayFixture();
      final comparator = rankedComparatorJson(
        candidateId: v3CandidateId,
        publishedAt: v3PublishedAt,
        observedAfter: const Duration(minutes: 30),
        popularity: const ReaderPromotionCountsFixture(10, 9, 1),
      );
      final seal = fixture['seal']! as Map<String, Object?>;
      final v2 = v3AttestationBody(seal, comparator: comparator);
      expect(verifyV3Attestation(v2, fixture), isNotNull);
      final v1 = v3AttestationBody(
        seal,
        comparator: comparator,
        policyVersion: 'reader_promotion.2026-11-01',
      );
      expect(
        verifyV3Attestation(
          v1,
          fixture,
          transportPolicyVersion: 'reader_promotion.2026-11-01',
        ),
        isNull,
      );
      comparator['metricMature'] = false;
      comparator['popularity'] = null;
      final old = v3AttestationBody(
        seal,
        comparator: comparator,
        policyVersion: 'reader_promotion.2026-11-01',
      );
      expect(
        verifyV3Attestation(
          old,
          fixture,
          cardSignalScore: 0,
          transportPolicyVersion: 'reader_promotion.2026-11-01',
        ),
        isNotNull,
      );
    },
  );

  test(
    'V2 rejects forged eligibility for future or pre-publication observations',
    () {
      final fixture = publicV3DisplayFixture();
      for (final age in [
        const Duration(microseconds: -1),
        const Duration(days: 3),
      ]) {
        final body = v3AttestationBody(
          fixture['seal']! as Map<String, Object?>,
          comparator: rankedComparatorJson(
            candidateId: v3CandidateId,
            publishedAt: v3PublishedAt,
            observedAfter: age,
            popularity: const ReaderPromotionCountsFixture(10, 9, 1),
          ),
        );
        expect(verifyV3Attestation(body, fixture), isNull);
      }
    },
  );

  test('V3 transport stamp must equal the signed policy stamp', () {
    final fixture = publicV3DisplayFixture();
    final body = v3AttestationBody(fixture['seal']! as Map<String, Object?>);
    expect(
      verifyV3Attestation(
        body,
        fixture,
        transportPolicyVersion: 'reader_promotion.2026-11-01',
      ),
      isNull,
    );
  });
}
