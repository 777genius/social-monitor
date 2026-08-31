import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_post_promotion_attestation_verifier.dart';

void main() {
  test(
    'accepts trusted source-catalog non-official cross-provider support',
    () {
      final body = _attestedBodyWithSupport();
      (_support(body)['authorityAttestation']!
              as Map<String, Object?>)['official'] =
          false;
      expect(
        _verify(
          body,
          cardProviderKey: 'hacker-news',
          citationIds: const ['citation-1', 'citation-2'],
        ),
        isNotNull,
      );
    },
  );

  test(
    'accepts schema-valid producer authority without reconstructing policy',
    () {
      final body = _attestedBodyWithSupport();
      (_support(body)['authorityAttestation']! as Map<String, Object?>)
        ..['official'] = true
        ..['trusted'] = true
        ..['attestedBy'] = 'producer';
      expect(
        _verify(
          body,
          cardProviderKey: 'hacker-news',
          citationIds: const ['citation-1', 'citation-2'],
        ),
        isNotNull,
      );
    },
  );

  test(
    'keeps provenance integrity while leaving backend policy authoritative',
    () {
      const integrityFailures = {
        'support must use the same period window',
        'support must target the exact lead identity',
        'support candidate must be independent',
        'support whyImportant must be trimmed non-empty',
      };
      for (final entry in _semanticCases()) {
        final body = _attestedBodyWithSupport();
        entry.mutate(body);
        expect(
          _verify(
            body,
            cardProviderKey: body['provider']! as String,
            citationIds: List<String>.from(body['citationIds']! as List),
          ),
          integrityFailures.contains(entry.reason) ? isNull : isNotNull,
          reason: entry.reason,
        );
      }
    },
  );

  test('does not reconstruct backend provider thresholds or formulas', () {
    for (final entry in _providerFormulaCases()) {
      final valid = _leadOnlyBody(
        provider: entry.provider,
        contentKind: entry.contentKind,
        metrics: entry.metrics,
        checkedAt: entry.checkedAt,
      );
      expect(
        _verify(
          valid,
          cardProviderKey: entry.provider,
          citationIds: const ['citation-1'],
        ),
        isNotNull,
        reason: 'valid ${entry.reason}',
      );

      final forged = _leadOnlyBody(
        provider: entry.provider,
        contentKind: entry.contentKind,
        metrics: entry.metrics,
        checkedAt: entry.checkedAt,
      );
      entry.mutate(forged);
      expect(
        _verify(
          forged,
          cardProviderKey: entry.provider,
          citationIds: const ['citation-1'],
        ),
        isNotNull,
        reason: entry.reason,
      );
    }
  });
}

List<({String reason, void Function(Map<String, Object?> body) mutate})>
_semanticCases() => [
  (
    reason: 'quality gate must stay true',
    mutate: (body) => body['qualityValid'] = false,
  ),
  (
    reason: 'safety gate must stay true',
    mutate: (body) => body['safetyValid'] = false,
  ),
  (
    reason: 'citation gate must stay true',
    mutate: (body) => body['citationValid'] = false,
  ),
  (
    reason: 'freshness gate must stay true',
    mutate: (body) => body['freshnessValid'] = false,
  ),
  (
    reason: 'lead engagement must remain eligible',
    mutate: (body) => (body['metrics']! as Map<String, Object?>)['points'] = 24,
  ),
  (
    reason: 'support engagement formula must remain exact',
    mutate: (body) =>
        (_support(body)['metrics']! as Map<String, Object?>)['weightedScore'] =
            36,
  ),
  (
    reason: 'support authority must be trusted',
    mutate: (body) =>
        (_support(body)['authorityAttestation']!
                as Map<String, Object?>)['trusted'] =
            false,
  ),
  (
    reason: 'support authority must come from source catalog',
    mutate: (body) =>
        (_support(body)['authorityAttestation']!
                as Map<String, Object?>)['attestedBy'] =
            'producer',
  ),
  (
    reason: 'support must use the same period window',
    mutate: (body) =>
        _support(body)['periodStart'] = '2026-08-17T00:00:00.000Z',
  ),
  (
    reason: 'support must target the exact lead identity',
    mutate: (body) =>
        (_support(body)['relation']!
                as Map<String, Object?>)['targetCanonicalIdentity'] =
            'story:forged',
  ),
  (
    reason: 'support candidate must be independent',
    mutate: (body) => _support(body)['candidateId'] = 'candidate-top',
  ),
  (
    reason: 'same-story relation must be approved',
    mutate: (body) =>
        (_support(body)['relation']! as Map<String, Object?>)['approved'] =
            false,
  ),
  (
    reason: 'same-story confidence must meet the V1 floor',
    mutate: (body) =>
        (_support(body)['relation']! as Map<String, Object?>)['confidence'] =
            0.91,
  ),
  (
    reason: 'usefulness total must be derived from V1 weights',
    mutate: (body) =>
        (body['usefulnessComponents']! as Map<String, Object?>)['total'] = 1,
  ),
  (
    reason: 'support whyImportant must be trimmed non-empty',
    mutate: (body) => _support(body)['whyImportant'] = '   ',
  ),
];

List<
  ({
    String reason,
    String provider,
    String contentKind,
    Map<String, Object?> metrics,
    String? checkedAt,
    void Function(Map<String, Object?> body) mutate,
  })
>
_providerFormulaCases() => [
  (
    reason: 'X weightedScore must equal likes plus two times reposts',
    provider: 'x-twitter',
    contentKind: 'original_post',
    metrics: {'provider': 'x', 'likes': 30, 'reposts': 20, 'weightedScore': 70},
    checkedAt: null,
    mutate: (body) =>
        (body['metrics']! as Map<String, Object?>)['weightedScore'] = 71,
  ),
  (
    reason: 'Reddit trusted top ratio must meet the exact floor',
    provider: 'reddit',
    contentKind: 'original_post',
    metrics: {'provider': 'reddit', 'score': 50, 'upvoteRatio': 0.60},
    checkedAt: null,
    mutate: (body) =>
        (body['metrics']! as Map<String, Object?>)['upvoteRatio'] = 0.59,
  ),
  (
    reason: 'Hacker News top points must meet the exact floor',
    provider: 'hacker-news',
    contentKind: 'story',
    metrics: {'provider': 'hacker_news', 'points': 50},
    checkedAt: null,
    mutate: (body) => (body['metrics']! as Map<String, Object?>)['points'] = 49,
  ),
  (
    reason: 'GitHub 24 hour delta must meet the exact top floor',
    provider: 'github-repo-radar',
    contentKind: 'repository',
    metrics: {
      'provider': 'github_radar',
      'snapshotKind': 'repository_growth',
      'windowStartedAt': '2026-08-17T11:00:00.000Z',
      'windowEndedAt': '2026-08-18T11:00:00.000Z',
      'starsDelta': 50,
      'forksDelta': 0,
    },
    checkedAt: '2026-08-18T11:00:00.000Z',
    mutate: (body) =>
        (body['metrics']! as Map<String, Object?>)['starsDelta'] = 49,
  ),
];

Object? _verify(
  Map<String, Object?> body, {
  required String cardProviderKey,
  required List<String> citationIds,
}) {
  final payload = jsonEncode(body);
  return verifyReaderPostPromotionAttestation(
    schemaVersion: readerPostPromotionAttestationSchemaV1,
    policyVersion: readerPostPromotionPolicyV1,
    digestVersion: readerPostPromotionDigestV1,
    digest: sha256.convert(utf8.encode(payload)).toString(),
    canonicalPayload: payload,
    candidateId: body['candidateId']! as String,
    canonicalIdentity: body['canonicalIdentity']! as String,
    placement: body['placement']! as String,
    artifactId: body['artifactId']! as String,
    sourceWindowId: body['sourceWindowId']! as String,
    enclosingArtifactId: body['artifactId']! as String,
    enclosingSourceWindowId: body['sourceWindowId']! as String,
    enclosingPeriodStart: DateTime.parse(body['periodStartedAt']! as String),
    enclosingPeriodEnd: DateTime.parse(body['periodEndedAt']! as String),
    enclosingIngestionCutoff: DateTime.parse(
      body['ingestionCutoff']! as String,
    ),
    slot: body['slot']! as int,
    decision: body['decision']! as String,
    citationIds: citationIds,
    cardProviderKey: cardProviderKey,
    cardPublishedAt: DateTime.parse(body['publishedAt']! as String),
    cardCitationIds: citationIds,
  );
}

Map<String, Object?> _leadOnlyBody({
  required String provider,
  required String contentKind,
  required Map<String, Object?> metrics,
  required String? checkedAt,
}) => <String, Object?>{
  ..._commonLead(
    provider: provider,
    contentKind: contentKind,
    metrics: Map<String, Object?>.from(metrics),
    checkedAt: checkedAt,
    citationIds: const ['citation-1'],
    providerCount: 1,
    confidence: 0.42,
  ),
  'usefulnessComponents': _usefulness(1),
  'supportFacts': <Object?>[],
};

Map<String, Object?> _attestedBodyWithSupport() => <String, Object?>{
  ..._commonLead(
    provider: 'hacker-news',
    contentKind: 'story',
    metrics: {'provider': 'hacker_news', 'points': 50},
    checkedAt: null,
    citationIds: const ['citation-1', 'citation-2'],
    providerCount: 2,
    confidence: 0.8500000000000001,
  ),
  'usefulnessComponents': _usefulness(1),
  'supportFacts': [
    {
      'candidateId': 'candidate-support',
      'provider': 'x-twitter',
      'contentKind': 'original_post',
      'canonicalIdentity': 'story:official-release',
      'citationId': 'citation-2',
      'publishedAt': '2026-08-18T09:00:00.000Z',
      'observedAt': '2026-08-18T11:00:00.000Z',
      'periodStart': '2026-08-18T00:00:00.000Z',
      'periodEnd': '2026-08-19T00:00:00.000Z',
      'ingestionCutoff': '2026-08-18T23:00:00.000Z',
      'freshnessValid': true,
      'qualityScore': 0.8,
      'relevanceScore': 0.8,
      'integrityScore': 0.8,
      'qualityValid': true,
      'safetyValid': true,
      'citationValid': true,
      'authorityAttestation': {
        'status': 'attested',
        'official': true,
        'trusted': true,
        'attestedBy': 'source_catalog',
      },
      'metricsState': 'observed',
      'metrics': {
        'provider': 'x',
        'likes': 15,
        'reposts': 10,
        'weightedScore': 35,
      },
      'relation': {
        'kind': 'same_story',
        'targetCanonicalIdentity': 'story:release',
        'confidence': 0.92,
        'approved': true,
      },
      'whyImportant': 'Official confirmation',
    },
  ],
};

Map<String, Object?> _commonLead({
  required String provider,
  required String contentKind,
  required Map<String, Object?> metrics,
  required String? checkedAt,
  required List<String> citationIds,
  required int providerCount,
  required double confidence,
}) => <String, Object?>{
  'schemaVersion': readerPostPromotionAttestationSchemaV1,
  'policyVersion': readerPostPromotionPolicyV1,
  'digestVersion': readerPostPromotionDigestV1,
  'artifactId': 'artifact-1',
  'sourceWindowId': 'window-1',
  'periodStartedAt': '2026-08-18T00:00:00.000Z',
  'periodEndedAt': '2026-08-19T00:00:00.000Z',
  'ingestionCutoff': '2026-08-18T23:00:00.000Z',
  'placement': 'top',
  'slot': 0,
  'candidateId': 'candidate-top',
  'provider': provider,
  'contentKind': contentKind,
  'canonicalIdentity': 'story:release',
  'publishedAt': '2026-08-18T10:00:00.000Z',
  'observedAt': '2026-08-18T11:00:00.000Z',
  'checkedAt': ?checkedAt,
  'citationId': 'citation-1',
  'freshnessValid': true,
  'qualityScore': 0.8,
  'relevanceScore': 0.8,
  'integrityScore': 0.8,
  'qualityValid': true,
  'safetyValid': true,
  'citationValid': true,
  'metricsState': 'observed',
  'metrics': metrics,
  'tier': 'top',
  'decision': 'promote_top',
  'reason': 'top_engagement_floor_met',
  'citationIds': citationIds,
  'providerCount': providerCount,
  'confidence': confidence,
  'canonicalDedupeOutcome': 'retained',
  'capOutcome': 'selected',
};

Map<String, Object?> _support(Map<String, Object?> body) =>
    (body['supportFacts']! as List<Object?>).single as Map<String, Object?>;

Map<String, Object?> _usefulness(double normalizedStrength) {
  const quality = 0.8;
  const relevance = 0.8;
  const integrity = 0.8;
  const freshness = 10 / 24;
  final components = {
    'normalizedStrength': 0.35 * normalizedStrength,
    'qualityScore': 0.25 * quality,
    'interestRelevanceScore': 0.20 * relevance,
    'engagementIntegrityScore': 0.10 * integrity,
    'freshness': 0.10 * freshness,
  };
  return {
    ...components,
    'total': components.values.fold<double>(0, (sum, value) => sum + value),
  };
}
