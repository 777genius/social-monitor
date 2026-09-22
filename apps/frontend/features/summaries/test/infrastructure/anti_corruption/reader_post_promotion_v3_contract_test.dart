import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_post_promotion_attestation_verifier.dart';

import '../../support/reader_display_headline_fixture.dart';

void main() {
  for (final providerKey in ['hacker-news', 'x-twitter', 'github-repo-radar']) {
    test('preserves production provider identity $providerKey', () {
      final fixture = _providerFixture(providerKey);
      final body = _body(fixture['seal']! as Map<String, Object?>)
        ..['provider'] = providerKey;
      expect(_verify(body, fixture, cardProviderKey: providerKey), isNotNull);
    });
  }

  test('verifies nested V3 while rejecting semantic and digest tampering', () {
    final fixture = _publicV3Fixture();
    final seal = fixture['seal']! as Map<String, Object?>;
    final body = _body(seal);
    expect(_verify(body, fixture), isNotNull);

    final legacyCutoffTamper = _copy(body)
      ..['ingestionCutoff'] = '2026-09-21T00:00:00.124Z';
    expect(_verify(legacyCutoffTamper, fixture), isNull);
    final exactCutoffTamper = _copy(body)
      ..['exactIngestionCutoff'] = '2026-09-21T00:00:00.123457Z';
    expect(_verify(exactCutoffTamper, fixture), isNull);

    final millisecondOnlyCard = _copy(body);
    expect(
      _verify(
        millisecondOnlyCard,
        fixture,
        cardPublishedAt: DateTime.parse('2026-09-20T12:00:00.123Z'),
      ),
      isNull,
    );

    final adjacent = _copy(body);
    (adjacent['assessment']! as Map<String, Object?>)['answers'] = _answers(
      relevance: 'adjacent',
    );
    (adjacent['comparator']! as Map<String, Object?>)['relevance'] = 'adjacent';
    expect(_verify(adjacent, fixture), isNull);

    final reordered = _copy(body)..['citationIds'] = ['citation-2'];
    expect(_verify(reordered, fixture), isNull);
    final inconsistentChoice = _copy(body);
    (((inconsistentChoice['assessment']! as Map<String, Object?>)['answers']!
                as Map<String, Object?>)['usefulness']!
            as Map<String, Object?>)['choiceDiffersFromArgmax'] =
        true;
    expect(_verify(inconsistentChoice, fixture), isNull);
    final nonCanonicalAssessedAt = _copy(body);
    (nonCanonicalAssessedAt['assessment']!
            as Map<String, Object?>)['assessedAt'] =
        '2026-09-20T12:01:00Z';
    expect(_verify(nonCanonicalAssessedAt, fixture), isNull);
    expect(_verify(body, fixture, digest: _hex('0')), isNull);
  });

  test('rejects tampered V3 outer promotion lane claims', () {
    final fixture = _publicV3Fixture();
    final body = _body(fixture['seal']! as Map<String, Object?>);

    // The sealed claim remains top/promote_top.  A changed outer wrapper
    // must not be reconstructed from those canonical bytes.
    expect(
      _verify(
        body,
        fixture,
        transportPlacement: 'additional',
        transportDecision: 'promote_additional',
      ),
      isNull,
    );
    expect(
      _verify(body, fixture, transportPlacement: null),
      isNull,
    );
    expect(
      _verify(body, fixture, transportDecision: null),
      isNull,
    );
  });

  test('rejects a V3 card story-cluster rename without resealing', () {
    final fixture = _publicV3Fixture();
    final body = _body(fixture['seal']! as Map<String, Object?>);

    expect(
      _verify(body, fixture, cardStoryClusterId: 'story-renamed'),
      isNull,
    );
    expect(_verify(body, fixture, cardStoryClusterId: null), isNull);
  });

  test('rejects missing or changed independent V3 transport bindings', () {
    final fixture = _publicV3Fixture();
    final body = _body(fixture['seal']! as Map<String, Object?>);
    final changedAssessment = _copy(
      body['assessment']! as Map<String, Object?>,
    )..['assessmentId'] = 'changed-assessment';

    expect(_verify(body, fixture, transportProvider: null), isNull);
    expect(_verify(body, fixture, transportProvider: 'rss'), isNull);
    expect(_verify(body, fixture, transportStoryId: null), isNull);
    expect(
      _verify(body, fixture, transportStoryId: 'story-renamed'),
      isNull,
    );
    expect(
      _verify(body, fixture, transportAssessment: changedAssessment),
      isNull,
    );
    expect(_verify(body, fixture, transportPresentation: null), isNull);
  });

  test('rejects reordered-key and whitespace V3 bytes despite matching digest', () {
    final fixture = _publicV3Fixture();
    final body = _body(fixture['seal']! as Map<String, Object?>);
    final reordered = <String, Object?>{
      for (final entry in body.entries.toList().reversed) entry.key: entry.value,
    };
    expect(_verify(reordered, fixture, canonicalPayload: jsonEncode(reordered)), isNull);
    expect(_verify(body, fixture, canonicalPayload: ' ${_canonical(body)}'), isNull);
  });

  test('rejects legacy not_assessed compatibility headlines in V3', () {
    final fixture = _publicV3Fixture();
    final unavailable = <String, Object?>{
      'headline': <String, Object?>{
        'status': 'unavailable',
        'reasonCode': 'not_assessed',
      },
    };
    final body = _body(unavailable)
      ..['presentation'] = <String, Object?>{
        'schemaVersion': 'reader_post_presentation.v3',
        'presentationInputDigest': _hex('4'),
        'displayHeadline': unavailable,
      };
    expect(_verify(body, fixture), isNull);
  });

  test('rejects V3 plaintext interest bindings', () {
    final privateFixture = readerDisplayFixture();
    final body = _body(privateFixture['seal']! as Map<String, Object?>);
    expect(_verify(body, privateFixture), isNull);
  });
}

Object? _verify(
  Map<String, Object?> body,
  Map<String, Object?> fixture, {
  String? digest,
  String? canonicalPayload,
  DateTime? cardPublishedAt,
  String? transportPlacement = 'top',
  String? transportDecision = 'promote_top',
  String? cardStoryClusterId = 'story-orion',
  String cardProviderKey = 'reddit',
  Object? transportProvider = _unmodified,
  Object? transportStoryId = _unmodified,
  Object? transportAssessment = _unmodified,
  Object? transportPresentation = _unmodified,
}) {
  final canonical = canonicalPayload ?? _canonical(body);
  return verifyReaderPostPromotionAttestation(
    schemaVersion: readerPostPromotionAttestationSchemaV3,
    policyVersion: readerPostPromotionPolicyV3,
    digestVersion: readerPostPromotionDigestV3,
    digest: digest ?? sha256.convert(utf8.encode(canonical)).toString(),
    canonicalPayload: canonical,
    candidateId: '44444444-4444-4444-8444-444444444444',
    canonicalIdentity: 'https://example.test/orion',
    placement: transportPlacement,
    artifactId: 'artifact-v3',
    sourceWindowId: 'window-v3',
    enclosingArtifactId: 'artifact-v3',
    enclosingSourceWindowId: 'window-v3',
    enclosingPeriodStart: DateTime.parse('2026-09-20T00:00:00.000Z'),
    enclosingPeriodEnd: DateTime.parse('2026-09-21T00:00:00.000Z'),
    enclosingIngestionCutoff: DateTime.parse('2026-09-21T00:00:00.123456Z'),
    enclosingExactIngestionCutoff: '2026-09-21T00:00:00.123456Z',
    slot: 1,
    decision: transportDecision,
    citationIds: const ['citation-1'],
    displayHeadline: fixture['headline'],
    capturedSource: fixture['source'],
    cardTitle: 'Orion model discussion',
    tenantId: 'tenant-fixture',
    workspaceId: 'workspace-fixture',
    sourceItemId: 'source-fixture',
    sourceCandidateId: '44444444-4444-4444-8444-444444444444',
    cardProviderKey: cardProviderKey,
    cardStoryClusterId: cardStoryClusterId,
    cardPublishedAt:
        cardPublishedAt ?? DateTime.parse('2026-09-20T12:00:00.123456Z'),
    cardCitationIds: const ['citation-1'],
    outerProvider: identical(transportProvider, _unmodified)
        ? body['provider']
        : transportProvider,
    outerStoryId: identical(transportStoryId, _unmodified)
        ? body['storyId']
        : transportStoryId,
    outerPublishedAt: body['publishedAt'],
    outerExactIngestionCutoff: body['exactIngestionCutoff'],
    outerAssessment: identical(transportAssessment, _unmodified)
        ? body['assessment']
        : transportAssessment,
    outerComparator: body['comparator'],
    outerPresentation: identical(transportPresentation, _unmodified)
        ? body['presentation']
        : transportPresentation,
  );
}

const _unmodified = Object();

String _canonical(Object? value) {
  if (value is List<Object?>) return jsonEncode(value.map(_canonicalValue).toList());
  return jsonEncode(_canonicalValue(value));
}

Object? _canonicalValue(Object? value) {
  if (value is List<Object?>) return value.map(_canonicalValue).toList();
  if (value is Map<String, Object?>) {
    final keys = value.keys.toList()..sort();
    return {for (final key in keys) key: _canonicalValue(value[key])};
  }
  return value;
}

Map<String, Object?> _providerFixture(String providerKey) {
  final fixture = readerDisplayFixture();
  final headline = fixture['headline']! as Map<String, Object?>;
  final binding = headline['binding']! as Map<String, Object?>;
  final source = fixture['source']! as Map<String, Object?>;
  binding['providerKey'] = providerKey;
  final context = {
    for (final key in [
      'tenantId',
      'workspaceId',
      'interestId',
      'sourceBindingId',
      'sourceItemId',
      'trustedIntent',
      'availability',
    ])
      key: binding[key],
  };
  binding['reviewedInputDigest'] = sha256
      .convert(
        utf8.encode(
          jsonEncode({
            'candidateId': binding['candidateId'],
            'providerKey': providerKey,
            'context': context,
            'title': source['title'],
            'body': source['body'],
          }),
        ),
      )
      .toString();
  return _publicV3Fixture(fixture);
}

Map<String, Object?> _publicV3Fixture([Map<String, Object?>? fixture]) {
  final publicFixture = fixture ?? readerDisplayFixture();
  final headline = publicFixture['headline']! as Map<String, Object?>;
  final binding = headline['binding']! as Map<String, Object?>;
  final intent = binding.remove('trustedIntent')! as String;
  binding['interestDigest'] = _interestDigest(binding, intent);
  return publicFixture;
}

String _interestDigest(Map<String, Object?> binding, String intent) => sha256
    .convert(
      utf8.encode(
        jsonEncode({
          'interestId': binding['interestId'],
          'schemaVersion': 'reader_post_presentation.v3',
          'tenantId': binding['tenantId'],
          'trustedIntent': intent,
          'workspaceId': binding['workspaceId'],
        }),
      ),
    )
    .toString();

Map<String, Object?> _body(Map<String, Object?> seal) {
  final body = <String, Object?>{
  'schemaVersion': readerPostPromotionAttestationSchemaV3,
  'policyVersion': readerPostPromotionPolicyV3,
  'digestVersion': readerPostPromotionDigestV3,
  'artifactId': 'artifact-v3',
  'sourceWindowId': 'window-v3',
  'periodStartedAt': '2026-09-20T00:00:00.000Z',
  'periodEndedAt': '2026-09-21T00:00:00.000Z',
  'ingestionCutoff': '2026-09-21T00:00:00.123Z',
  'exactIngestionCutoff': '2026-09-21T00:00:00.123456Z',
  'placement': 'top',
  'slot': 1,
  'candidateId': '44444444-4444-4444-8444-444444444444',
  'provider': 'reddit',
  'canonicalIdentity': 'https://example.test/orion',
  'storyId': 'story-orion',
  'publishedAt': '2026-09-20T12:00:00.123456Z',
  'citationIds': ['citation-1'],
  'decision': 'promote_top',
  'assessment': {
    'schemaVersion': 'reader_value.v1',
    'assessmentId': 'assessment-v3',
    'assessedAt': '2026-09-20T12:01:00.000000Z',
    'sourceSnapshotSha256': _hex('1'),
    'inputSha256': _hex('2'),
    'rubricVersion': 'reader-value.v1',
    'rubricSha256': _hex('3'),
    'modelConfigVersion': 'jev.v1',
    'answers': _answers(),
  },
  'comparator': {
    'usefulness': 'useful',
    'relevance': 'central',
    'publishedAt': '2026-09-20T12:00:00.123456Z',
    'candidateId': '44444444-4444-4444-8444-444444444444',
  },
  'presentation': {
    'schemaVersion': 'reader_post_presentation.v3',
    'presentationInputDigest': _hex('4'),
    'displayHeadline': seal,
  },
  };
  final presentation = body['presentation']! as Map<String, Object?>;
  presentation['presentationIdentity'] = _presentationIdentity(
    ((body['assessment']! as Map<String, Object?>)['sourceSnapshotSha256']! as String),
    presentation['presentationInputDigest']! as String,
    presentation['displayHeadline'],
  );
  return body;
}

Map<String, Object?> _answers({String relevance = 'central'}) => {
  'usefulness': _answer('useful', [
    'noise',
    'context',
    'useful',
    'important',
    'insufficient_context',
  ]),
  'relevance': _answer(relevance, [
    'unrelated',
    'adjacent',
    'relevant',
    'central',
    'insufficient_context',
  ]),
  'context_sufficiency': _answer('partial', [
    'sufficient',
    'partial',
    'insufficient',
  ]),
  'evidence_basis': _answer('linked_claim', [
    'observation',
    'described_data',
    'linked_claim',
    'unsupported_claim',
    'no_claim',
    'insufficient_context',
  ]),
};

Map<String, Object?> _answer(String choice, List<String> labels) => {
  'choice': choice,
  'probabilities': {for (final label in labels) label: label == choice ? 1 : 0},
  'confidence': .9,
  'choiceDiffersFromArgmax': false,
  'probabilityTie': false,
};

Map<String, Object?> _copy(Map<String, Object?> value) =>
    (jsonDecode(jsonEncode(value))! as Map).cast<String, Object?>();
String _hex(String character) => List.filled(64, character).join();

String _presentationIdentity(
  String sourceSnapshotSha256,
  String presentationInputDigest,
  Object? displayHeadline,
) => sha256
    .convert(
      utf8.encode(
        _canonical({
          'schemaVersion': 'reader_post_presentation.v3',
          'sourceSnapshotSha256': sourceSnapshotSha256,
          'presentationInputDigest': presentationInputDigest,
          'displayHeadline': displayHeadline,
        }),
      ),
    )
    .toString();
