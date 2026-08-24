import 'dart:convert';

import 'package:crypto/crypto.dart';

Map<String, Object?> promotionAttestationRestFixture({
  required String candidateId,
  required String canonicalIdentity,
  required String placement,
  required List<String> citationIds,
  required String providerKey,
  List<String> supportProviderKeys = const [],
  String artifactId = 'fixture-artifact',
  String sourceWindowId = 'fixture-window',
  String periodStartedAt = '2026-08-18T00:00:00.000Z',
  String periodEndedAt = '2026-08-19T00:00:00.000Z',
  String ingestionCutoff = '2026-08-18T23:00:00.000Z',
  String publishedAt = '2026-08-18T10:00:00.000Z',
  String observedAt = '2026-08-18T11:00:00.000Z',
  String? supportPublishedAt,
  String? supportObservedAt,
  int slot = 0,
}) {
  const schemaVersion = 'reader_post_promotion_attestation.v1';
  const policyVersion = 'reader_post_promotion.v1';
  const digestVersion = 'reader_post_promotion_digest.sha256.v1';
  final decision = placement == 'top' ? 'promote_top' : 'promote_additional';
  final provider = _providerFamily(providerKey);
  final normalizedStrength = placement == 'top' ? 1.0 : 0.5;
  const qualityComponent = 0.25 * 0.8;
  const relevanceComponent = 0.20 * 0.8;
  const integrityComponent = 0.10 * 0.8;
  final periodDuration = DateTime.parse(
    periodEndedAt,
  ).difference(DateTime.parse(periodStartedAt));
  final publishedOffset = DateTime.parse(
    publishedAt,
  ).difference(DateTime.parse(periodStartedAt));
  final freshnessComponent =
      0.10 *
      (publishedOffset.inMilliseconds / periodDuration.inMilliseconds).clamp(
        0,
        1,
      );
  final normalizedStrengthComponent = 0.35 * normalizedStrength;
  final usefulnessTotal =
      normalizedStrengthComponent +
      qualityComponent +
      relevanceComponent +
      integrityComponent +
      freshnessComponent;
  final supportFacts = <Map<String, Object?>>[
    for (var index = 1; index < citationIds.length; index++)
      if (index - 1 < supportProviderKeys.length)
        _supportFact(
          candidateId: '$candidateId:support:$index',
          canonicalIdentity: '$canonicalIdentity:support:$index',
          citationId: citationIds[index],
          providerKey: supportProviderKeys[index - 1],
          targetCanonicalIdentity: canonicalIdentity,
          periodStartedAt: periodStartedAt,
          periodEndedAt: periodEndedAt,
          ingestionCutoff: ingestionCutoff,
          publishedAt: supportPublishedAt ?? publishedAt,
          observedAt: supportObservedAt ?? observedAt,
        ),
  ];
  final canonicalPayload = jsonEncode({
    'artifactId': artifactId,
    'candidateId': candidateId,
    'canonicalIdentity': canonicalIdentity,
    'citationIds': citationIds,
    'decision': decision,
    'digestVersion': digestVersion,
    'periodStartedAt': periodStartedAt,
    'periodEndedAt': periodEndedAt,
    'ingestionCutoff': ingestionCutoff,
    'placement': placement,
    'policyVersion': policyVersion,
    'schemaVersion': schemaVersion,
    'slot': slot,
    'sourceWindowId': sourceWindowId,
    'provider': providerKey,
    'contentKind': switch (provider) {
      'hacker_news' => 'story',
      'github_radar' => 'repository',
      _ => 'original_post',
    },
    'publishedAt': publishedAt,
    'observedAt': observedAt,
    'citationId': citationIds.isEmpty ? '' : citationIds.first,
    'freshnessValid': true,
    'qualityScore': 0.8,
    'relevanceScore': 0.8,
    'integrityScore': 0.8,
    'qualityValid': true,
    'safetyValid': true,
    'citationValid': true,
    'metricsState': 'observed',
    'metrics': _metrics(provider, placement: placement),
    if (provider == 'x')
      'authorityAttestation': {
        'status': 'attested',
        'official': false,
        'trusted': false,
        'attestedBy': 'source_catalog',
      },
    'tier': placement,
    'reason': placement == 'top'
        ? 'top_engagement_floor_met'
        : 'additional_engagement_floor_met',
    'usefulnessComponents': {
      'normalizedStrength': normalizedStrengthComponent,
      'qualityScore': qualityComponent,
      'interestRelevanceScore': relevanceComponent,
      'engagementIntegrityScore': integrityComponent,
      'freshness': freshnessComponent,
      'total': usefulnessTotal,
    },
    'supportFacts': supportFacts,
    'providerCount': <String>{
      provider,
      ...supportProviderKeys.map(_providerFamily),
    }.length,
    'confidence': supportFacts.isEmpty ? 0.42 : 0.8 + 0.05,
    'canonicalDedupeOutcome': 'retained',
    'capOutcome': 'selected',
  });
  return {
    'schemaVersion': schemaVersion,
    'policyVersion': policyVersion,
    'digestVersion': digestVersion,
    'digest': sha256.convert(utf8.encode(canonicalPayload)).toString(),
    'canonicalPayload': canonicalPayload,
    'artifactId': artifactId,
    'sourceWindowId': sourceWindowId,
    'slot': slot,
    'candidateId': candidateId,
    'canonicalIdentity': canonicalIdentity,
    'citationIds': citationIds,
    'placement': placement,
    'decision': decision,
  };
}

Map<String, Object?> _supportFact({
  required String candidateId,
  required String canonicalIdentity,
  required String citationId,
  required String providerKey,
  required String targetCanonicalIdentity,
  required String periodStartedAt,
  required String periodEndedAt,
  required String ingestionCutoff,
  required String publishedAt,
  required String observedAt,
}) {
  final provider = _providerFamily(providerKey);
  return {
    'candidateId': candidateId,
    'provider': providerKey,
    'contentKind': switch (provider) {
      'hacker_news' => 'story',
      'github_radar' => 'repository',
      _ => 'original_post',
    },
    'canonicalIdentity': canonicalIdentity,
    'citationId': citationId,
    'publishedAt': publishedAt,
    'observedAt': observedAt,
    'periodStart': periodStartedAt,
    'periodEnd': periodEndedAt,
    'ingestionCutoff': ingestionCutoff,
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
    'whyImportant': 'Independent evidence confirms the same story.',
    'metricsState': 'observed',
    'metrics': _metrics(provider, placement: 'top'),
    'relation': {
      'kind': 'same_story',
      'targetCanonicalIdentity': targetCanonicalIdentity,
      'confidence': 0.92,
      'approved': true,
    },
  };
}

String _providerFamily(String providerKey) {
  final key = providerKey.toLowerCase();
  if (key == 'x' || key == 'x-twitter' || key == 'twitter') return 'x';
  if (key == 'reddit') return 'reddit';
  if (key == 'hacker_news' || key == 'hacker-news' || key == 'hn') {
    return 'hacker_news';
  }
  return 'github_radar';
}

Map<String, Object?> _metrics(String provider, {required String placement}) =>
    switch (provider) {
      'x' =>
        placement == 'top'
            ? {'provider': 'x', 'likes': 30, 'reposts': 20, 'weightedScore': 70}
            : {
                'provider': 'x',
                'likes': 15,
                'reposts': 10,
                'weightedScore': 35,
              },
      'reddit' => {'provider': 'reddit', 'score': placement == 'top' ? 50 : 25},
      'hacker_news' => {
        'provider': 'hacker_news',
        'points': placement == 'top' ? 50 : 25,
      },
      _ => {
        'provider': 'github_radar',
        'snapshotKind': 'repository_growth',
        'windowStartedAt': '2026-08-17T23:00:00.000Z',
        'windowEndedAt': '2026-08-18T23:00:00.000Z',
        'starsDelta': placement == 'top' ? 50 : 25,
        'forksDelta': 0,
      },
    };
