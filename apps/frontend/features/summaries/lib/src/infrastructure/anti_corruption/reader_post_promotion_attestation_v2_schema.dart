part of 'reader_post_promotion_attestation_verifier.dart';

bool _validV2CanonicalFields(Map<String, Object?> body) {
  final score = body['scoreComponents'];
  final reasonCodes = _stringList(body['reasonCodes']);
  final lineage = body['evidenceLineage'];
  final supports = body['supportFacts']! as List<Object?>;
  final slateDigestInput = body['slateDigestInput'];
  final slateDigest = body['slateDigest'];
  if (!_nonEmptyStrings(body, const {
        'storyClusterId',
        'candidateDigestInput',
        'slateEntryDigestInput',
        'slateDigestInput',
        'slateDigest',
      }) ||
      score is! Map<String, Object?> ||
      !_validV2ScoreComponents(score) ||
      reasonCodes == null ||
      reasonCodes.isEmpty ||
      reasonCodes.toSet().length != reasonCodes.length ||
      reasonCodes.any((code) => code.trim().isEmpty) ||
      lineage is! Map<String, Object?> ||
      !_validV2EvidenceLineage(lineage, body, supports) ||
      slateDigestInput is! String ||
      slateDigest is! String ||
      !RegExp(r'^[0-9a-f]{64}$').hasMatch(slateDigest) ||
      sha256.convert(utf8.encode(slateDigestInput)).toString() != slateDigest ||
      !_validV2CandidateDigestInput(body) ||
      !_validV2SlateEntryDigestInput(body) ||
      !_validV2SlateDigestInput(body)) {
    return false;
  }
  return true;
}

bool _validV2CandidateDigestInput(Map<String, Object?> body) {
  final Object? decoded;
  try {
    decoded = jsonDecode(body['candidateDigestInput']! as String);
  } on FormatException {
    return false;
  }
  return decoded is Map<String, Object?> &&
      decoded['policyVersion'] == readerPromotionEditorialSlatePolicyVersion &&
      decoded['candidateId'] == body['candidateId'] &&
      decoded['canonicalIdentity'] == body['canonicalIdentity'] &&
      decoded['provider'] == _editorialProvider(body['provider']);
}

const _v2ScoreComponentKeys = <String>{
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
};

bool _validV2ScoreComponents(Map<String, Object?> score) {
  if (!_exactKeys(score, _v2ScoreComponentKeys, const {}) ||
      !const {
        'engagementSalience',
        'relevance',
        'evidenceQuality',
        'integrity',
        'freshness',
      }.every((key) => _unit(score[key])) ||
      !const {
        'weightedEngagement',
        'weightedRelevance',
        'weightedEvidenceQuality',
        'weightedIntegrity',
        'weightedFreshness',
        'total',
      }.every((key) => _finiteNonNegative(score[key]))) {
    return false;
  }
  final weightedTotal = const {
    'weightedEngagement',
    'weightedRelevance',
    'weightedEvidenceQuality',
    'weightedIntegrity',
    'weightedFreshness',
  }.fold<double>(0, (total, key) => total + (score[key]! as num).toDouble());
  return (weightedTotal - (score['total']! as num).toDouble()).abs() <= 1e-12;
}

bool _validV2EvidenceLineage(
  Map<String, Object?> lineage,
  Map<String, Object?> body,
  List<Object?> supports,
) {
  if (!_exactKeys(lineage, const {
        'leadCandidateId',
        'leadCitationId',
        'supportCandidateIds',
        'supportCitationIds',
        'citationIds',
      }, const {}) ||
      lineage['leadCandidateId'] != body['candidateId'] ||
      lineage['leadCitationId'] != body['citationId']) {
    return false;
  }
  final supportRecords = supports.cast<Map<String, Object?>>();
  return _sameOrderedStrings(
        _stringList(lineage['supportCandidateIds']) ?? const [],
        supportRecords.map((fact) => fact['candidateId']! as String).toList(),
      ) &&
      _sameOrderedStrings(
        _stringList(lineage['supportCitationIds']) ?? const [],
        supportRecords.map((fact) => fact['citationId']! as String).toList(),
      ) &&
      _sameOrderedStrings(
        _stringList(lineage['citationIds']) ?? const [],
        _stringList(body['citationIds']) ?? const [],
      );
}

bool _validV2SlateEntryDigestInput(Map<String, Object?> body) {
  final Object? decoded;
  try {
    decoded = jsonDecode(body['slateEntryDigestInput']! as String);
  } on FormatException {
    return false;
  }
  if (decoded is! Map<String, Object?> ||
      !_exactKeys(decoded, const {
        'policyVersion',
        'placement',
        'slot',
        'candidateId',
        'canonicalIdentity',
        'provider',
        'storyClusterId',
        'scoreComponents',
        'reasonCodes',
        'candidateDigestInput',
      }, const {})) {
    return false;
  }
  final decodedScore = decoded['scoreComponents'];
  final bodyScore = body['scoreComponents'];
  return decoded['policyVersion'] ==
          readerPromotionEditorialSlatePolicyVersion &&
      decoded['placement'] == body['placement'] &&
      decoded['slot'] == body['slot'] &&
      decoded['candidateId'] == body['candidateId'] &&
      decoded['canonicalIdentity'] == body['canonicalIdentity'] &&
      decoded['provider'] == _editorialProvider(body['provider']) &&
      decoded['storyClusterId'] == body['storyClusterId'] &&
      decodedScore is Map<String, Object?> &&
      bodyScore is Map<String, Object?> &&
      _validV2ScoreComponents(decodedScore) &&
      _v2ScoreComponentKeys.every(
        (key) => decodedScore[key] == bodyScore[key],
      ) &&
      jsonEncode(decoded['reasonCodes']) == jsonEncode(body['reasonCodes']) &&
      decoded['candidateDigestInput'] == body['candidateDigestInput'];
}

bool _validV2SlateDigestInput(Map<String, Object?> body) {
  final Object? decoded;
  try {
    decoded = jsonDecode(body['slateDigestInput']! as String);
  } on FormatException {
    return false;
  }
  if (decoded is! Map<String, Object?> ||
      !_exactKeys(decoded, const {
        'policyVersion',
        'sourceWindow',
        'orderedCandidateIds',
        'orderedCanonicalIdentities',
        'digestInputs',
      }, const {}) ||
      decoded['policyVersion'] != readerPromotionEditorialSlatePolicyVersion) {
    return false;
  }
  final candidateIds = _stringList(decoded['orderedCandidateIds']);
  final canonicalIdentities = _stringList(
    decoded['orderedCanonicalIdentities'],
  );
  final digestInputs = _stringList(decoded['digestInputs']);
  final sourceWindow = decoded['sourceWindow'];
  final candidateIndex = candidateIds?.indexOf(body['candidateId'] as String);
  return sourceWindow is Map<String, Object?> &&
      _exactKeys(sourceWindow, const {
        'windowId',
        'startedAt',
        'endedAt',
        'periodStartedAt',
        'periodEndedAt',
        'ingestionCutoff',
      }, const {}) &&
      sourceWindow['windowId'] == body['sourceWindowId'] &&
      sourceWindow['periodStartedAt'] == body['periodStartedAt'] &&
      sourceWindow['periodEndedAt'] == body['periodEndedAt'] &&
      sourceWindow['ingestionCutoff'] == body['ingestionCutoff'] &&
      candidateIds != null &&
      canonicalIdentities != null &&
      digestInputs != null &&
      candidateIds.length == canonicalIdentities.length &&
      candidateIds.length == digestInputs.length &&
      candidateIndex != null &&
      candidateIndex >= 0 &&
      canonicalIdentities[candidateIndex] == body['canonicalIdentity'] &&
      digestInputs[candidateIndex] == body['slateEntryDigestInput'] &&
      (body['placement'] != 'top' ||
          candidateIndex == (body['slot'] as int) - 1);
}

String? _editorialProvider(Object? provider) {
  if (provider is! String) return null;
  final family = _providerFamily(provider);
  return family == 'github_radar' ? 'github' : family;
}
