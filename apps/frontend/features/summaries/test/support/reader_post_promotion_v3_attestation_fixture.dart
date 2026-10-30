import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_post_promotion_attestation_verifier.dart';

import 'reader_display_headline_fixture.dart';
import 'reader_promotion_comparator_fixture.dart';

const v3CandidateId = '44444444-4444-4444-8444-444444444444';
const v3PublishedAt = '2026-09-20T12:00:00.123456Z';

/// Signal of the default ranked comparator: (9 + 1/2) / 10 * 10.
const v3DefaultCardSignal = 9.5;

const _unmodified = Object();

/// Display fixture with the public V3 interest digest instead of plaintext
/// intent, re-bound to [providerKey].
Map<String, Object?> publicV3DisplayFixture({String providerKey = 'reddit'}) {
  final fixture = readerDisplayFixture();
  final headline = fixture['headline']! as Map<String, Object?>;
  final binding = headline['binding']! as Map<String, Object?>;
  binding['providerKey'] = providerKey;
  final intent = binding.remove('trustedIntent')! as String;
  binding['interestDigest'] = _interestDigest(binding, intent);
  return fixture;
}

/// Mature Reddit Top card: 984 upvotes, 9 of 10 cohort members below.
Map<String, Object?> defaultRankedComparator() => rankedComparatorJson(
  candidateId: v3CandidateId,
  publishedAt: v3PublishedAt,
  popularity: const ReaderPromotionCountsFixture(10, 9, 1),
  engagementValue: 984,
);

/// Signed V3 attestation body in the exact backend shape.
Map<String, Object?> v3AttestationBody(
  Map<String, Object?> seal, {
  String placement = 'top',
  String provider = 'reddit',
  Map<String, Object?>? comparator,
  String policyVersion = readerPromotionPolicyStamp,
}) {
  final body = <String, Object?>{
    'schemaVersion': readerPostPromotionAttestationSchemaV3,
    'policyVersion': policyVersion,
    'digestVersion': readerPostPromotionDigestV3,
    'artifactId': 'artifact-v3',
    'sourceWindowId': 'window-v3',
    'periodStartedAt': '2026-09-20T00:00:00.000Z',
    'periodEndedAt': '2026-09-21T00:00:00.000Z',
    'ingestionCutoff': '2026-09-21T00:00:00.123Z',
    'exactIngestionCutoff': '2026-09-21T00:00:00.123456Z',
    'placement': placement,
    'slot': 1,
    'candidateId': v3CandidateId,
    'provider': provider,
    'canonicalIdentity': 'https://example.test/orion',
    'storyId': 'story-orion',
    'publishedAt': v3PublishedAt,
    'citationIds': ['citation-1'],
    'decision': 'promote_$placement',
    'assessment': {
      'schemaVersion': 'reader_value.v1',
      'assessmentId': 'assessment-v3',
      'assessedAt': '2026-09-20T12:01:00.000000Z',
      'sourceSnapshotSha256': _hex('1'),
      'inputSha256': _hex('2'),
      'rubricVersion': 'reader-value.v1',
      'rubricSha256': _hex('3'),
      'modelConfigVersion': 'jev.v1',
      'answers': v3Answers(),
    },
    'comparator': comparator ?? defaultRankedComparator(),
    'presentation': {
      'schemaVersion': 'reader_post_presentation.v3',
      'presentationInputDigest': _hex('4'),
      'displayHeadline': seal,
    },
  };
  final presentation = body['presentation']! as Map<String, Object?>;
  presentation['presentationIdentity'] = sha256
      .convert(
        utf8.encode(
          canonicalV3Json({
            'schemaVersion': 'reader_post_presentation.v3',
            'sourceSnapshotSha256': _hex('1'),
            'presentationInputDigest': _hex('4'),
            'displayHeadline': seal,
          }),
        ),
      )
      .toString();
  return body;
}

/// Runs the production verifier with the card and transport fields a
/// consistent REST response carries; named overrides tamper one of them.
Object? verifyV3Attestation(
  Map<String, Object?> body,
  Map<String, Object?> fixture, {
  String? digest,
  String? canonicalPayload,
  DateTime? cardPublishedAt,
  Object? transportPlacement = _unmodified,
  Object? transportDecision = _unmodified,
  String? cardStoryClusterId = 'story-orion',
  Object? cardProviderKey = _unmodified,
  num? cardSignalScore = v3DefaultCardSignal,
  Object? transportProvider = _unmodified,
  Object? transportStoryId = _unmodified,
  Object? transportPeriodStartedAt = _unmodified,
  Object? transportPeriodEndedAt = _unmodified,
  Object? transportIngestionCutoff = _unmodified,
  Object? transportAssessment = _unmodified,
  Object? transportComparator = _unmodified,
  Object? transportPresentation = _unmodified,
  Object? transportPolicyVersion = _unmodified,
}) {
  Object? pick(Object? override, Object? original) =>
      identical(override, _unmodified) ? original : override;
  final canonical = canonicalPayload ?? canonicalV3Json(body);
  return verifyReaderPostPromotionAttestation(
    schemaVersion: readerPostPromotionAttestationSchemaV3,
    policyVersion:
        pick(transportPolicyVersion, body['policyVersion']) as String?,
    digestVersion: readerPostPromotionDigestV3,
    digest: digest ?? sha256.convert(utf8.encode(canonical)).toString(),
    canonicalPayload: canonical,
    candidateId: v3CandidateId,
    canonicalIdentity: 'https://example.test/orion',
    placement: pick(transportPlacement, body['placement']) as String?,
    artifactId: 'artifact-v3',
    sourceWindowId: 'window-v3',
    enclosingArtifactId: 'artifact-v3',
    enclosingSourceWindowId: 'window-v3',
    enclosingPeriodStart: DateTime.parse('2026-09-20T00:00:00.000Z'),
    enclosingPeriodEnd: DateTime.parse('2026-09-21T00:00:00.000Z'),
    enclosingIngestionCutoff: DateTime.parse('2026-09-21T00:00:00.123456Z'),
    enclosingExactIngestionCutoff: '2026-09-21T00:00:00.123456Z',
    slot: 1,
    decision: pick(transportDecision, body['decision']) as String?,
    citationIds: const ['citation-1'],
    displayHeadline: fixture['headline'],
    capturedSource: fixture['source'],
    cardTitle: 'Orion model discussion',
    tenantId: 'tenant-fixture',
    workspaceId: 'workspace-fixture',
    sourceItemId: 'source-fixture',
    sourceCandidateId: v3CandidateId,
    cardProviderKey: pick(cardProviderKey, body['provider']) as String?,
    cardStoryClusterId: cardStoryClusterId,
    cardPublishedAt: cardPublishedAt ?? DateTime.parse(v3PublishedAt),
    cardCitationIds: const ['citation-1'],
    cardSignalScore: cardSignalScore,
    outerProvider: pick(transportProvider, body['provider']),
    outerStoryId: pick(transportStoryId, body['storyId']),
    outerPublishedAt: body['publishedAt'],
    outerPeriodStartedAt: pick(
      transportPeriodStartedAt,
      body['periodStartedAt'],
    ),
    outerPeriodEndedAt: pick(transportPeriodEndedAt, body['periodEndedAt']),
    outerIngestionCutoff: pick(
      transportIngestionCutoff,
      body['ingestionCutoff'],
    ),
    outerExactIngestionCutoff: body['exactIngestionCutoff'],
    outerAssessment: pick(transportAssessment, body['assessment']),
    outerComparator: pick(transportComparator, body['comparator']),
    outerPresentation: pick(transportPresentation, body['presentation']),
  );
}

/// Backend `canonicalPromotionPayload` for the ASCII contract keys.
String canonicalV3Json(Object? value) => jsonEncode(_canonicalValue(value));

Object? _canonicalValue(Object? value) {
  if (value is List<Object?>) return value.map(_canonicalValue).toList();
  if (value is Map<String, Object?>) {
    final keys = value.keys.toList()..sort();
    return {for (final key in keys) key: _canonicalValue(value[key])};
  }
  return value;
}

Map<String, Object?> v3Answers({
  String usefulness = 'useful',
  String relevance = 'central',
}) => {
  'usefulness': _answer(usefulness, const [
    'noise',
    'context',
    'useful',
    'important',
    'insufficient_context',
  ]),
  'relevance': _answer(relevance, const [
    'unrelated',
    'adjacent',
    'relevant',
    'central',
    'insufficient_context',
  ]),
  'context_sufficiency': _answer('partial', const [
    'sufficient',
    'partial',
    'insufficient',
  ]),
  'evidence_basis': _answer('linked_claim', const [
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

Map<String, Object?> copyJson(Map<String, Object?> value) =>
    (jsonDecode(jsonEncode(value))! as Map).cast<String, Object?>();

String _hex(String character) => List.filled(64, character).join();

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
