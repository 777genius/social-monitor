part of 'reader_post_promotion_attestation_verifier.dart';

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
