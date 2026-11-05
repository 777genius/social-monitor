import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_post_promotion_attestation_verifier.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'reader_post_promotion_v2_body_fixture.dart';

void main() {
  test('accepts and preserves the complete Promotion V2 authority', () {
    final body = _v2Body();
    final result = _verifyV2(body);

    expect(result, isNotNull);
    expect(result!.schemaVersion, readerPostPromotionAttestationSchemaVersion);
    expect(result.policyVersion, readerPostPromotionPolicyVersion);
    expect(result.slot, 1);
    expect(result.slateDigestInput, body['slateDigestInput']);
    expect(result.scoreComponents?.total, 0.66);
  });

  test(
    'accepts reordered score object keys without changing signed inputs',
    () {
      final body = _v2Body();
      final score = body['scoreComponents']! as Map<String, Object?>;
      body['scoreComponents'] = Map<String, Object?>.fromEntries(
        score.entries.toList().reversed,
      );

      final result = _verifyV2(body);

      expect(result, isNotNull);
      expect(result!.slateEntryDigestInput, body['slateEntryDigestInput']);
      expect(result.slateDigestInput, body['slateDigestInput']);
    },
  );

  test('fails closed for unknown V2 schema, policy, or digest tuples', () {
    for (final mutation in <void Function(Map<String, Object?>)>[
      (body) => body['schemaVersion'] = 'reader_post_promotion_attestation.v9',
      (body) => body['policyVersion'] = 'reader_post_promotion.v9',
      (body) =>
          body['digestVersion'] = 'reader_post_promotion_digest.sha256.v9',
    ]) {
      final body = _v2Body();
      mutation(body);
      expect(_verifyV2(body), isNull);
    }
  });

  test('rejects V2 missing, extra, and malformed canonical fields', () {
    for (final mutation in <void Function(Map<String, Object?>)>[
      (body) => body.remove('storyClusterId'),
      (body) => body['unexpected'] = true,
      (body) => (body['scoreComponents']! as Map<String, Object?>).remove(
        'freshness',
      ),
      (body) =>
          (body['evidenceLineage']! as Map<String, Object?>)['unexpected'] =
              true,
      (body) => body['slot'] = 0,
    ]) {
      final body = _v2Body();
      mutation(body);
      expect(_verifyV2(body), isNull);
    }
  });

  test('rejects tampered V2 digest, candidate, placement, and slate order', () {
    final digest = _v2Body();
    expect(_verifyV2(digest, digest: '0' * 64), isNull);

    final candidate = _v2Body()..['candidateId'] = 'candidate-forged';
    expect(_verifyV2(candidate), isNull);

    final placement = _v2Body()
      ..['placement'] = 'additional'
      ..['tier'] = 'additional'
      ..['decision'] = 'promote_additional';
    expect(_verifyV2(placement), isNull);

    final order = _v2Body();
    final slate =
        jsonDecode(order['slateDigestInput']! as String)
            as Map<String, Object?>;
    slate['orderedCandidateIds'] = ['candidate-other', 'candidate-top'];
    slate['orderedCanonicalIdentities'] = ['story:other', 'story:release'];
    slate['digestInputs'] = ['entry:other', order['slateEntryDigestInput']];
    _replaceSlate(order, slate);
    expect(_verifyV2(order), isNull);
  });

  test('rejects tampered V2 candidate and slate-entry digest material', () {
    final candidateInput = _v2Body();
    final candidate =
        jsonDecode(candidateInput['candidateDigestInput']! as String)
            as Map<String, Object?>;
    candidate['provider'] = 'reddit';
    candidateInput['candidateDigestInput'] = jsonEncode(candidate);
    expect(_verifyV2(candidateInput), isNull);

    final entryInput = _v2Body();
    final entry =
        jsonDecode(entryInput['slateEntryDigestInput']! as String)
            as Map<String, Object?>;
    entry['provider'] = 'reddit';
    entryInput['slateEntryDigestInput'] = jsonEncode(entry);
    expect(_verifyV2(entryInput), isNull);

    final scoreValue = _v2Body();
    (scoreValue['scoreComponents']!
            as Map<String, Object?>)['engagementSalience'] =
        0.51;
    expect(_verifyV2(scoreValue), isNull);

    final slateDigest = _v2Body()..['slateDigest'] = 'f' * 64;
    expect(_verifyV2(slateDigest), isNull);
  });

  test('accepts V2 source-title display when the headline was never assessed', () {
    const title = 'Runtime regression discussion';
    final headline = <String, Object?>{
      'status': 'unavailable',
      'reasonCode': 'not_assessed',
    };
    final source = <String, Object?>{
      'title': title,
      'body': 'Users are discussing a runtime regression.',
      'captureAvailability': 'available',
      'reviewAvailability': 'body_present',
    };
    final seal = <String, Object?>{'headline': headline};
    final body = _v2Body()..['displayHeadline'] = seal;
    expect(
      _verifyV2(
        body,
        displayHeadline: headline,
        capturedSource: source,
        displayHeadlineSeal: seal,
        cardTitle: title,
      ),
      isNotNull,
    );
  });

  test('accepts V2 source-title display for an X body presentation', () {
    const sourceTitle = 'X post by @atlas: Atlas documents agent safety';
    const bodyText =
        'Atlas documents agent safety findings across public websites.';
    const title = 'Atlas documents agent safety\n\n$bodyText';
    final headline = <String, Object?>{
      'status': 'unavailable',
      'reasonCode': 'not_assessed',
    };
    final source = <String, Object?>{
      'title': sourceTitle,
      'body': bodyText,
      'captureAvailability': 'available',
      'reviewAvailability': 'body_present',
    };
    final seal = <String, Object?>{'headline': headline};
    final body = _v2Body()..['displayHeadline'] = seal;
    expect(
      _verifyV2(
        body,
        displayHeadline: headline,
        capturedSource: source,
        displayHeadlineSeal: seal,
        cardTitle: title,
      ),
      isNotNull,
    );
  });

  test('rejects V2 source-title display when the published reason is not not_assessed', () {
    const title = 'Runtime regression discussion';
    final headline = <String, Object?>{
      'status': 'unavailable',
      'reasonCode': 'invalid_assessment',
    };
    final source = <String, Object?>{
      'title': title,
      'body': 'Users are discussing a runtime regression.',
      'captureAvailability': 'available',
      'reviewAvailability': 'body_present',
    };
    final seal = <String, Object?>{'headline': headline};
    final body = _v2Body()..['displayHeadline'] = seal;
    expect(
      _verifyV2(
        body,
        displayHeadline: headline,
        capturedSource: source,
        displayHeadlineSeal: seal,
        cardTitle: title,
      ),
      isNull,
    );
  });
}

ReaderPostPromotionAttestationApiDto? _verifyV2(
  Map<String, Object?> body, {
  String? digest,
  Object? displayHeadline,
  Object? capturedSource,
  Object? displayHeadlineSeal,
  String? cardTitle,
}) {
  final payload = jsonEncode(body);
  final score = body['scoreComponents'];
  final lineage = body['evidenceLineage'];
  return verifyReaderPostPromotionAttestation(
    schemaVersion: body['schemaVersion'] as String? ?? '',
    policyVersion: body['policyVersion'] as String? ?? '',
    digestVersion: body['digestVersion'] as String? ?? '',
    digest: digest ?? sha256.convert(utf8.encode(payload)).toString(),
    canonicalPayload: payload,
    candidateId: body['candidateId'] as String? ?? '',
    canonicalIdentity: body['canonicalIdentity'] as String? ?? '',
    placement: body['placement'] as String? ?? '',
    artifactId: body['artifactId'] as String? ?? '',
    sourceWindowId: body['sourceWindowId'] as String? ?? '',
    enclosingArtifactId: 'artifact-1',
    enclosingSourceWindowId: 'window-1',
    enclosingPeriodStart: DateTime.parse('2026-08-18T00:00:00.000Z'),
    enclosingPeriodEnd: DateTime.parse('2026-08-19T00:00:00.000Z'),
    enclosingIngestionCutoff: DateTime.parse('2026-08-18T23:00:00.000Z'),
    slot: body['slot'] is int ? body['slot']! as int : -1,
    decision: body['decision'] as String? ?? '',
    citationIds: body['citationIds'] is List<Object?>
        ? (body['citationIds']! as List<Object?>).whereType<String>().toList()
        : const [],
    storyClusterId: body['storyClusterId'] as String?,
    scoreComponents: score is Map<String, Object?>
        ? _scoreComponents(score)
        : null,
    reasonCodes: body['reasonCodes'] is List<Object?>
        ? (body['reasonCodes']! as List<Object?>).whereType<String>().toList()
        : const [],
    candidateDigestInput: body['candidateDigestInput'] as String?,
    slateEntryDigestInput: body['slateEntryDigestInput'] as String?,
    slateDigestInput: body['slateDigestInput'] as String?,
    slateDigest: body['slateDigest'] as String?,
    evidenceLineage: lineage is Map<String, Object?>
        ? _evidenceLineage(lineage)
        : null,
    displayHeadline: displayHeadline,
    capturedSource: capturedSource,
    displayHeadlineSeal: displayHeadlineSeal,
    cardTitle: cardTitle,
    cardProviderKey: 'hacker-news',
    cardStoryClusterId: 'cluster:release',
    cardPublishedAt: DateTime.parse('2026-08-18T10:00:00.000Z'),
    cardCitationIds: const ['citation-1'],
  );
}

ReaderPostPromotionScoreComponentsApiDto? _scoreComponents(
  Map<String, Object?> score,
) {
  final values = <String>[
    'engagementSalience',
    'relevance',
    'evidenceQuality',
    'integrity',
    'freshness',
    'weightedEngagement',
    'weightedRelevance',
    'weightedEvidenceQuality',
    'weightedIntegrity',
    'weightedFreshness',
    'total',
  ].map((key) => score[key]).toList();
  if (values.any((value) => value is! num)) return null;
  return ReaderPostPromotionScoreComponentsApiDto(
    engagementSalience: (values[0]! as num).toDouble(),
    relevance: (values[1]! as num).toDouble(),
    evidenceQuality: (values[2]! as num).toDouble(),
    integrity: (values[3]! as num).toDouble(),
    freshness: (values[4]! as num).toDouble(),
    weightedEngagement: (values[5]! as num).toDouble(),
    weightedRelevance: (values[6]! as num).toDouble(),
    weightedEvidenceQuality: (values[7]! as num).toDouble(),
    weightedIntegrity: (values[8]! as num).toDouble(),
    weightedFreshness: (values[9]! as num).toDouble(),
    total: (values[10]! as num).toDouble(),
  );
}

ReaderPostPromotionEvidenceLineageApiDto? _evidenceLineage(
  Map<String, Object?> lineage,
) {
  final leadCandidateId = lineage['leadCandidateId'];
  final leadCitationId = lineage['leadCitationId'];
  final supportCandidateIds = lineage['supportCandidateIds'];
  final supportCitationIds = lineage['supportCitationIds'];
  final citationIds = lineage['citationIds'];
  if (leadCandidateId is! String ||
      leadCitationId is! String ||
      supportCandidateIds is! List<Object?> ||
      supportCitationIds is! List<Object?> ||
      citationIds is! List<Object?>) {
    return null;
  }
  return ReaderPostPromotionEvidenceLineageApiDto(
    leadCandidateId: leadCandidateId,
    leadCitationId: leadCitationId,
    supportCandidateIds: supportCandidateIds.whereType<String>().toList(),
    supportCitationIds: supportCitationIds.whereType<String>().toList(),
    citationIds: citationIds.whereType<String>().toList(),
  );
}

Map<String, Object?> _v2Body() => v2PromotionCanonicalBody();

void _replaceSlate(Map<String, Object?> body, Map<String, Object?> slate) {
  final slateInput = jsonEncode(slate);
  body['slateDigestInput'] = slateInput;
  body['slateDigest'] = sha256.convert(utf8.encode(slateInput)).toString();
}
