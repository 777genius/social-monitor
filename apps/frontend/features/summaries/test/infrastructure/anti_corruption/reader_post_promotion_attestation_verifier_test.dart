import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_post_promotion_attestation_verifier.dart';

void main() {
  test('accepts the complete Promotion V1 canonical body', () {
    expect(_verify(_body()), isNotNull);
  });

  test('rejects the formerly accepted partial self-hashed body', () {
    final partial = <String, Object?>{
      'artifactId': 'artifact-1',
      'candidateId': 'candidate-top',
      'canonicalIdentity': 'story:release',
      'citationIds': ['citation-1'],
      'decision': 'promote_top',
      'digestVersion': readerPostPromotionDigestVersion,
      'placement': 'top',
      'policyVersion': readerPostPromotionPolicyVersion,
      'schemaVersion': readerPostPromotionAttestationSchemaVersion,
      'slot': 0,
      'sourceWindowId': 'window-1',
    };
    expect(_verify(partial), isNull);
  });

  test('rejects every missing attestation key after rehash', () {
    for (final key in _bodyRequiredKeys) {
      final body = _body()..remove(key);
      expect(_verify(body), isNull, reason: 'missing attestation.$key');
    }
  });

  test('rejects every missing nested schema key after rehash', () {
    _expectMissingNestedKeys('usefulnessComponents', _usefulnessKeys);
    _expectMissingNestedKeys('metrics', _hackerNewsMetricKeys);
    _expectMissingNestedKeys('supportFacts.0', _supportFactRequiredKeys);
    _expectMissingNestedKeys('supportFacts.0.metrics', _xMetricKeys);
    _expectMissingNestedKeys(
      'supportFacts.0.authorityAttestation',
      _authorityKeys,
    );
    _expectMissingNestedKeys('supportFacts.0.relation', _relationKeys);
  });

  test(
    'accepts an omitted optional support relation from the signed schema',
    () {
      final body = _body();
      _recordAt(body, 'supportFacts.0').remove('relation');
      expect(_verify(body), isNotNull);
    },
  );

  test('rejects extra keys at every nested schema level after rehash', () {
    for (final path in const [
      '',
      'usefulnessComponents',
      'metrics',
      'supportFacts.0',
      'supportFacts.0.metrics',
      'supportFacts.0.authorityAttestation',
      'supportFacts.0.relation',
    ]) {
      final body = _body();
      _recordAt(body, path)['unexpected'] = 1.0;
      expect(_verify(body), isNull, reason: 'extra key at $path');
    }
  });

  test('rejects a nested type mutation after rehash', () {
    final nested = _body();
    (nested['metrics']! as Map<String, Object?>)['points'] = '50';
    expect(_verify(nested), isNull);
  });

  test('enforces every provider metrics schema key without coercion', () {
    final cases =
        <
          ({
            String provider,
            Map<String, Object?> metrics,
            Set<String> required,
          })
        >[
          (
            provider: 'x-twitter',
            metrics: {
              'provider': 'x',
              'likes': 30,
              'reposts': 20,
              'weightedScore': 70,
            },
            required: _xMetricKeys,
          ),
          (
            provider: 'reddit',
            metrics: {'provider': 'reddit', 'score': 50, 'upvoteRatio': 0.8},
            required: _redditMetricRequiredKeys,
          ),
          (
            provider: 'github-repo-radar',
            metrics: {
              'provider': 'github_radar',
              'snapshotKind': 'repository_growth',
              'windowStartedAt': '2026-08-17T10:00:00.000Z',
              'windowEndedAt': '2026-08-18T10:00:00.000Z',
              'starsDelta': 50,
              'forksDelta': 0,
            },
            required: _githubMetricKeys,
          ),
          (
            provider: 'github-repo-radar',
            metrics: {
              'provider': 'github_radar',
              'snapshotKind': 'repository_growth',
              'windowStartedAt': '2026-08-16T10:00:00.000Z',
              'windowEndedAt': '2026-08-18T10:00:00.000Z',
              'starsDelta': 0,
              'forksDelta': 100,
            },
            required: _githubMetricKeys,
          ),
        ];
    for (final entry in cases) {
      final valid = _providerBody(entry.provider, entry.metrics);
      expect(
        _verify(
          valid,
          cardProviderKey: entry.provider,
          citationIds: const ['citation-1'],
        ),
        isNotNull,
        reason: 'valid ${entry.metrics['provider']}',
      );
      for (final key in entry.required) {
        final missing = _providerBody(entry.provider, entry.metrics);
        (missing['metrics']! as Map<String, Object?>).remove(key);
        expect(
          _verify(
            missing,
            cardProviderKey: entry.provider,
            citationIds: const ['citation-1'],
          ),
          isNull,
          reason: 'missing ${entry.metrics['provider']}.$key',
        );
      }
      final extra = _providerBody(entry.provider, entry.metrics);
      (extra['metrics']! as Map<String, Object?>)['unexpected'] = 1;
      expect(
        _verify(
          extra,
          cardProviderKey: entry.provider,
          citationIds: const ['citation-1'],
        ),
        isNull,
      );
    }
  });

  test('rejects reordered ordered citation and support arrays', () {
    final citations = _body();
    citations['citationIds'] = ['citation-2', 'citation-1'];
    expect(_verify(citations), isNull);

    final support = _body();
    final original = (support['supportFacts']! as List<Object?>).single;
    support['supportFacts'] = [original, original];
    expect(_verify(support), isNull);
  });

  test('rejects digest, lane, outer card, and version conflicts', () {
    expect(_verify(_body(), digest: '0' * 64), isNull);
    expect(_verify(_body(), placement: 'additional'), isNull);
    expect(_verify(_body(), cardProviderKey: 'reddit'), isNull);
    expect(
      _verify(_body()..['schemaVersion'] = 'unknown', schemaVersion: 'unknown'),
      isNull,
    );
  });

  test('rejects cross-artifact, period, window, and cutoff replay', () {
    expect(_verify(_body(), enclosingArtifactId: 'artifact-2'), isNull);
    expect(_verify(_body(), enclosingSourceWindowId: 'window-2'), isNull);
    expect(
      _verify(
        _body(),
        enclosingPeriodStart: DateTime.parse('2026-08-17T01:00:00.000Z'),
      ),
      isNull,
    );
    expect(
      _verify(
        _body(),
        enclosingIngestionCutoff: DateTime.parse('2026-08-18T22:59:59.999Z'),
      ),
      isNull,
    );
  });
}

void _expectMissingNestedKeys(String path, Set<String> keys) {
  for (final key in keys) {
    final body = _body();
    _recordAt(body, path).remove(key);
    expect(_verify(body), isNull, reason: 'missing $path.$key');
  }
}

Map<String, Object?> _recordAt(Map<String, Object?> body, String path) {
  if (path.isEmpty) return body;
  Object? current = body;
  for (final segment in path.split('.')) {
    final index = int.tryParse(segment);
    current = index == null
        ? (current! as Map<String, Object?>)[segment]
        : (current! as List<Object?>)[index];
  }
  return current! as Map<String, Object?>;
}

const _bodyRequiredKeys = <String>{
  'schemaVersion',
  'policyVersion',
  'digestVersion',
  'artifactId',
  'sourceWindowId',
  'periodStartedAt',
  'periodEndedAt',
  'ingestionCutoff',
  'placement',
  'slot',
  'candidateId',
  'provider',
  'contentKind',
  'canonicalIdentity',
  'publishedAt',
  'observedAt',
  'citationId',
  'freshnessValid',
  'qualityScore',
  'relevanceScore',
  'integrityScore',
  'qualityValid',
  'safetyValid',
  'citationValid',
  'metricsState',
  'metrics',
  'tier',
  'decision',
  'reason',
  'usefulnessComponents',
  'supportFacts',
  'citationIds',
  'providerCount',
  'confidence',
  'canonicalDedupeOutcome',
  'capOutcome',
};
const _usefulnessKeys = <String>{
  'normalizedStrength',
  'qualityScore',
  'interestRelevanceScore',
  'engagementIntegrityScore',
  'freshness',
  'total',
};
const _hackerNewsMetricKeys = <String>{'provider', 'points'};
const _redditMetricRequiredKeys = <String>{'provider', 'score'};
const _githubMetricKeys = <String>{
  'provider',
  'snapshotKind',
  'windowStartedAt',
  'windowEndedAt',
  'starsDelta',
  'forksDelta',
};
const _xMetricKeys = <String>{'provider', 'likes', 'reposts', 'weightedScore'};
const _authorityKeys = <String>{'status', 'official', 'trusted', 'attestedBy'};
const _relationKeys = <String>{
  'kind',
  'targetCanonicalIdentity',
  'confidence',
  'approved',
};
const _supportFactRequiredKeys = <String>{
  'candidateId',
  'provider',
  'contentKind',
  'canonicalIdentity',
  'citationId',
  'publishedAt',
  'observedAt',
  'periodStart',
  'periodEnd',
  'ingestionCutoff',
  'freshnessValid',
  'qualityScore',
  'relevanceScore',
  'integrityScore',
  'qualityValid',
  'safetyValid',
  'citationValid',
  'metricsState',
  'metrics',
  'whyImportant',
};

Object? _verify(
  Map<String, Object?> body, {
  String? digest,
  String? placement,
  String? schemaVersion,
  String cardProviderKey = 'hacker-news',
  List<String> citationIds = const ['citation-1', 'citation-2'],
  String enclosingArtifactId = 'artifact-1',
  String enclosingSourceWindowId = 'window-1',
  DateTime? enclosingPeriodStart,
  DateTime? enclosingIngestionCutoff,
}) {
  final payload = jsonEncode(body);
  return verifyReaderPostPromotionAttestation(
    schemaVersion: schemaVersion ?? readerPostPromotionAttestationSchemaV1,
    policyVersion: readerPostPromotionPolicyV1,
    digestVersion: readerPostPromotionDigestV1,
    digest: digest ?? sha256.convert(utf8.encode(payload)).toString(),
    canonicalPayload: payload,
    candidateId: 'candidate-top',
    canonicalIdentity: 'story:release',
    placement: placement ?? 'top',
    artifactId: 'artifact-1',
    sourceWindowId: 'window-1',
    enclosingArtifactId: enclosingArtifactId,
    enclosingSourceWindowId: enclosingSourceWindowId,
    enclosingPeriodStart:
        enclosingPeriodStart ?? DateTime.parse('2026-08-18T00:00:00.000Z'),
    enclosingPeriodEnd: DateTime.parse('2026-08-19T00:00:00.000Z'),
    enclosingIngestionCutoff:
        enclosingIngestionCutoff ?? DateTime.parse('2026-08-18T23:00:00.000Z'),
    slot: 0,
    decision: 'promote_top',
    citationIds: citationIds,
    cardProviderKey: cardProviderKey,
    cardPublishedAt: DateTime.parse('2026-08-18T10:00:00.000Z'),
    cardCitationIds: citationIds,
  );
}

Map<String, Object?> _providerBody(
  String provider,
  Map<String, Object?> metrics,
) => _body()
  ..['provider'] = provider
  ..['contentKind'] = provider == 'github-repo-radar'
      ? 'repository'
      : 'original_post'
  ..['metrics'] = Map<String, Object?>.from(metrics)
  ..addAll(
    provider == 'github-repo-radar'
        ? {'checkedAt': metrics['windowEndedAt']}
        : const {},
  )
  ..['supportFacts'] = <Object?>[]
  ..['citationIds'] = <Object?>['citation-1']
  ..['providerCount'] = 1
  ..['confidence'] = 0.42;

Map<String, Object?> _body() => <String, Object?>{
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
  'provider': 'hacker-news',
  'contentKind': 'story',
  'canonicalIdentity': 'story:release',
  'publishedAt': '2026-08-18T10:00:00.000Z',
  'observedAt': '2026-08-18T11:00:00.000Z',
  'citationId': 'citation-1',
  'freshnessValid': true,
  'qualityScore': 0.8,
  'relevanceScore': 0.8,
  'integrityScore': 0.8,
  'qualityValid': true,
  'safetyValid': true,
  'citationValid': true,
  'metricsState': 'observed',
  'metrics': {'provider': 'hacker_news', 'points': 50},
  'tier': 'top',
  'decision': 'promote_top',
  'reason': 'top_engagement_floor_met',
  'usefulnessComponents': {
    'normalizedStrength': 0.35,
    'qualityScore': 0.2,
    'interestRelevanceScore': 0.16000000000000003,
    'engagementIntegrityScore': 0.08000000000000002,
    'freshness': 0.04166666666666667,
    'total': 0.8316666666666667,
  },
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
        'official': false,
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
      'clusterId': 'cluster:release',
    },
  ],
  'citationIds': ['citation-1', 'citation-2'],
  'providerCount': 2,
  'confidence': 0.8500000000000001,
  'canonicalDedupeOutcome': 'retained',
  'capOutcome': 'selected',
};
