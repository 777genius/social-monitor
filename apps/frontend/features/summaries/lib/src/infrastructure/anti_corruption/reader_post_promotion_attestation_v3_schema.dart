part of 'reader_post_promotion_attestation_verifier.dart';

const _v3Keys = <String>{
  'schemaVersion',
  'policyVersion',
  'digestVersion',
  'artifactId',
  'sourceWindowId',
  'periodStartedAt',
  'periodEndedAt',
  'ingestionCutoff',
  'exactIngestionCutoff',
  'placement',
  'slot',
  'candidateId',
  'provider',
  'canonicalIdentity',
  'storyId',
  'publishedAt',
  'citationIds',
  'decision',
  'assessment',
  'comparator',
  'presentation',
};
const _v3AssessmentKeys = <String>{
  'schemaVersion',
  'assessmentId',
  'assessedAt',
  'sourceSnapshotSha256',
  'inputSha256',
  'rubricVersion',
  'rubricSha256',
  'modelConfigVersion',
  'answers',
};

ReaderPostPromotionAttestationApiDto? _verifyReaderPostPromotionAttestationV3({
  required Map<String, Object?> decoded,
  required String digest,
  required String canonicalPayload,
  required String candidateId,
  required String canonicalIdentity,
  required String artifactId,
  required String sourceWindowId,
  required String enclosingArtifactId,
  required String enclosingSourceWindowId,
  required DateTime enclosingPeriodStart,
  required DateTime enclosingPeriodEnd,
  required DateTime? enclosingIngestionCutoff,
  required String? enclosingExactIngestionCutoff,
  required String placement,
  required int slot,
  required String? decision,
  required List<String> citationIds,
  required Object? displayHeadline,
  required Object? capturedSource,
  required String? cardTitle,
  required String? tenantId,
  required String? workspaceId,
  required String? sourceItemId,
  required String? sourceCandidateId,
  required String? cardProviderKey,
  required String? cardStoryClusterId,
  required DateTime? cardPublishedAt,
  required List<String>? cardCitationIds,
  required Object? outerProvider,
  required Object? outerStoryId,
  required Object? outerPublishedAt,
  required Object? outerExactIngestionCutoff,
  required Object? outerAssessment,
  required Object? outerComparator,
  required Object? outerPresentation,
}) {
  if (!_v3ExactKeys(decoded, _v3Keys) ||
      decoded['schemaVersion'] != readerPostPromotionAttestationSchemaV3 ||
      decoded['policyVersion'] != readerPostPromotionPolicyV3 ||
      decoded['digestVersion'] != readerPostPromotionDigestV3 ||
      // A matching digest only proves the received bytes were hashed. V3
      // signs one canonical representation, so whitespace and member-order
      // variants are not valid signed payloads.
      canonicalPayload != _canonicalV3Payload(decoded) ||
      digest != sha256.convert(utf8.encode(canonicalPayload)).toString() ||
      decoded['candidateId'] != candidateId ||
      decoded['canonicalIdentity'] != canonicalIdentity ||
      decoded['artifactId'] != artifactId ||
      artifactId != enclosingArtifactId ||
      decoded['sourceWindowId'] != sourceWindowId ||
      sourceWindowId != enclosingSourceWindowId ||
      decoded['periodStartedAt'] !=
          enclosingPeriodStart.toUtc().toIso8601String() ||
      decoded['periodEndedAt'] !=
          enclosingPeriodEnd.toUtc().toIso8601String() ||
      enclosingIngestionCutoff == null ||
      enclosingExactIngestionCutoff == null ||
      !_canonicalV3Timestamp(decoded['exactIngestionCutoff']) ||
      decoded['ingestionCutoff'] is! String ||
      decoded['ingestionCutoff'] !=
          _millisecondTimestamp(enclosingIngestionCutoff) ||
      decoded['exactIngestionCutoff'] != enclosingExactIngestionCutoff ||
      _millisecondTimestamp(DateTime.parse(enclosingExactIngestionCutoff)) !=
          _millisecondTimestamp(enclosingIngestionCutoff) ||
      decoded['slot'] != slot ||
      slot < 1 ||
      // The outer promotion lane is independently transported.  It is not a
      // display hint: accepting a different outer lane would let an
      // additional card reuse a valid signed top-card attestation.
      decoded['placement'] != placement ||
      decoded['decision'] != decision ||
      !RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(candidateId) ||
      !{'top', 'additional'}.contains(decoded['placement']) ||
      decoded['decision'] !=
          (decoded['placement'] == 'top'
              ? 'promote_top'
              : 'promote_additional') ||
      decoded['provider'] is! String ||
      (decoded['provider']! as String).trim().isEmpty ||
      decoded['storyId'] is! String ||
      (decoded['storyId']! as String).trim().isEmpty ||
      !_sameOrderedStrings(
        _stringList(decoded['citationIds']) ?? const [],
        citationIds,
      ) ||
      (cardCitationIds != null &&
          !_sameOrderedStrings(citationIds, cardCitationIds)) ||
      decoded['provider'] != cardProviderKey ||
      decoded['provider'] != outerProvider ||
      decoded['storyId'] != outerStoryId ||
      // Story-cluster markers are the card-level identity.  V3 has no
      // fallback reconstruction for a renamed or removed marker; V1 cards
      // still retain their legitimate no-story behaviour outside this V3
      // binding.
      decoded['storyId'] != cardStoryClusterId ||
      decoded['publishedAt'] != outerPublishedAt ||
      decoded['exactIngestionCutoff'] != outerExactIngestionCutoff ||
      decoded['candidateId'] != sourceCandidateId ||
      (cardPublishedAt != null &&
          decoded['publishedAt'] != _v3Timestamp(cardPublishedAt))) {
    return null;
  }
  final assessment = decoded['assessment'];
  final comparator = decoded['comparator'];
  final presentation = decoded['presentation'];
  if (assessment is! Map<String, Object?> ||
      comparator is! Map<String, Object?> ||
      presentation is! Map<String, Object?> ||
      !_sameJson(assessment, outerAssessment) ||
      !_sameJson(comparator, outerComparator) ||
      !_sameJson(presentation, outerPresentation) ||
      !_validV3Assessment(assessment) ||
      !_v3ExactKeys(comparator, {
        'usefulness',
        'relevance',
        'publishedAt',
        'candidateId',
      }) ||
      comparator['usefulness'] !=
          _choice(
            (assessment['answers']! as Map<String, Object?>)['usefulness'],
          ) ||
      comparator['relevance'] !=
          _choice(
            (assessment['answers']! as Map<String, Object?>)['relevance'],
          ) ||
      comparator['publishedAt'] != decoded['publishedAt'] ||
      comparator['candidateId'] != decoded['candidateId'] ||
      !const {'useful', 'important'}.contains(comparator['usefulness']) ||
      !const {'relevant', 'central'}.contains(comparator['relevance']) ||
      !_canonicalV3Timestamp(decoded['publishedAt']) ||
      !_v3ExactKeys(presentation, {
        'schemaVersion',
        'presentationInputDigest',
        'presentationIdentity',
        'displayHeadline',
      }) ||
      presentation['schemaVersion'] != 'reader_post_presentation.v3' ||
      !_sha256String(presentation['presentationInputDigest']) ||
      !_sha256String(presentation['presentationIdentity']) ||
      presentation['presentationIdentity'] !=
          _presentationIdentity(
            assessment['sourceSnapshotSha256']! as String,
            presentation['presentationInputDigest']! as String,
            presentation['displayHeadline'],
          ) ||
      !verifyReaderDisplayHeadline(
        payload: decoded,
        headline: displayHeadline,
        source: capturedSource,
        outerSeal: presentation['displayHeadline'],
        title: cardTitle,
        providerKey: cardProviderKey,
        tenantId: tenantId,
        workspaceId: workspaceId,
        sourceItemId: sourceItemId,
        sourceCandidateId: sourceCandidateId,
      )) {
    return null;
  }
  return ReaderPostPromotionAttestationApiDto(
    schemaVersion: readerPostPromotionAttestationSchemaV3,
    policyVersion: readerPostPromotionPolicyV3,
    candidateId: candidateId,
    canonicalIdentity: canonicalIdentity,
    placement: decoded['placement']! as String,
    slot: slot,
    decision: decoded['decision']! as String,
    citationIds: List.unmodifiable(citationIds),
    assessment: Map.unmodifiable(assessment),
    comparator: Map.unmodifiable(comparator),
    presentation: Map.unmodifiable(presentation),
    providerKey: decoded['provider']! as String,
    storyId: decoded['storyId']! as String,
    exactPublishedAt: decoded['publishedAt']! as String,
  );
}

String _presentationIdentity(
  String sourceSnapshotSha256,
  String presentationInputDigest,
  Object? displayHeadline,
) => sha256
    .convert(
      utf8.encode(
        _canonicalV3Payload({
          'schemaVersion': 'reader_post_presentation.v3',
          'sourceSnapshotSha256': sourceSnapshotSha256,
          'presentationInputDigest': presentationInputDigest,
          'displayHeadline': displayHeadline,
        }),
      ),
    )
    .toString();

bool _sameJson(Object? left, Object? right) =>
    jsonEncode(_sortedJson(left)) == jsonEncode(_sortedJson(right));

Object? _sortedJson(Object? value) {
  final normalized = jsonDecode(jsonEncode(value));
  if (normalized is List<Object?>) return normalized.map(_sortedJson).toList();
  if (normalized is Map<String, Object?>) {
    final keys =
        normalized.keys.where((key) => normalized[key] != null).toList()
          ..sort();
    return {for (final key in keys) key: _sortedJson(normalized[key])};
  }
  return normalized;
}

bool _validV3Assessment(Map<String, Object?> value) {
  if (!_v3ExactKeys(value, _v3AssessmentKeys) ||
      value['schemaVersion'] != 'reader_value.v1' ||
      value['assessmentId'] is! String ||
      !_sha256String(value['sourceSnapshotSha256']) ||
      !_sha256String(value['inputSha256']) ||
      !_sha256String(value['rubricSha256']) ||
      value['rubricVersion'] is! String ||
      value['modelConfigVersion'] is! String ||
      !_canonicalV3Timestamp(value['assessedAt'])) {
    return false;
  }
  final answers = value['answers'];
  if (answers is! Map<String, Object?> ||
      !_v3ExactKeys(answers, {
        'usefulness',
        'relevance',
        'context_sufficiency',
        'evidence_basis',
      })) {
    return false;
  }
  return _answerChoice(answers['usefulness'], {
        'noise',
        'context',
        'useful',
        'important',
        'insufficient_context',
      }) &&
      _answerChoice(answers['relevance'], {
        'unrelated',
        'adjacent',
        'relevant',
        'central',
        'insufficient_context',
      }) &&
      _answerChoice(answers['context_sufficiency'], {
        'sufficient',
        'partial',
        'insufficient',
      }) &&
      _answerChoice(answers['evidence_basis'], {
        'observation',
        'described_data',
        'linked_claim',
        'unsupported_claim',
        'no_claim',
        'insufficient_context',
      });
}

bool _answerChoice(Object? value, Set<String> allowed) {
  if (value is! Map<String, Object?> ||
      !_v3ExactKeys(value, {
        'choice',
        'probabilities',
        'confidence',
        'choiceDiffersFromArgmax',
        'probabilityTie',
      }) ||
      !allowed.contains(value['choice']) ||
      value['probabilities'] is! Map<String, Object?> ||
      value['confidence'] is! num ||
      (value['confidence']! as num).isNaN ||
      (value['confidence']! as num) < 0 ||
      (value['confidence']! as num) > 1 ||
      value['choiceDiffersFromArgmax'] is! bool ||
      value['probabilityTie'] is! bool) {
    return false;
  }
  final probabilities = value['probabilities']! as Map<String, Object?>;
  if (!_v3ExactKeys(probabilities, allowed)) return false;
  var sum = 0.0;
  for (final probability in probabilities.values) {
    if (probability is! num ||
        !probability.isFinite ||
        probability < 0 ||
        probability > 1) {
      return false;
    }
    sum += probability.toDouble();
  }
  if ((sum - 1).abs() > 0.02) return false;
  final maximum = probabilities.values
      .cast<num>()
      .map((value) => value.toDouble())
      .reduce((a, b) => a > b ? a : b);
  final choiceProbability = (probabilities[value['choice']]! as num).toDouble();
  final differs = choiceProbability != maximum;
  final tie =
      probabilities.values
          .cast<num>()
          .where((probability) => probability.toDouble() == maximum)
          .length >
      1;
  return value['choiceDiffersFromArgmax'] == differs &&
      value['probabilityTie'] == tie;
}

bool _canonicalV3Timestamp(Object? value) =>
    value is String &&
    RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$').hasMatch(value) &&
    DateTime.tryParse(value) != null;
String _v3Timestamp(DateTime value) {
  final iso = value.toUtc().toIso8601String();
  final parts = iso.substring(0, iso.length - 1).split('.');
  final fraction = parts.length == 1 ? '' : parts.last;
  return '${parts.first}.${fraction.padRight(6, '0').substring(0, 6)}Z';
}

String _millisecondTimestamp(DateTime value) {
  final utc = value.toUtc();
  final truncated = DateTime.fromMicrosecondsSinceEpoch(
    (utc.microsecondsSinceEpoch ~/ Duration.microsecondsPerMillisecond) *
        Duration.microsecondsPerMillisecond,
    isUtc: true,
  );
  return truncated.toIso8601String();
}

bool _sha256String(Object? value) =>
    value is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(value);

Object? _choice(Object? value) =>
    value is Map<String, Object?> ? value['choice'] : null;

bool _v3ExactKeys(Map<String, Object?> value, Set<String> keys) =>
    value.length == keys.length && keys.every(value.containsKey);

/// Mirrors the backend's canonicalPromotionPayload for V3's ASCII contract
/// keys: recursively sort object keys and preserve list order and scalars.
String _canonicalV3Payload(Object? value) => jsonEncode(_canonicalV3Value(value));

Object? _canonicalV3Value(Object? value) {
  if (value is List<Object?>) {
    return value.map(_canonicalV3Value).toList(growable: false);
  }
  if (value is Map<String, Object?>) {
    final keys = value.keys.toList()..sort();
    return <String, Object?>{
      for (final key in keys) key: _canonicalV3Value(value[key]),
    };
  }
  return value;
}
