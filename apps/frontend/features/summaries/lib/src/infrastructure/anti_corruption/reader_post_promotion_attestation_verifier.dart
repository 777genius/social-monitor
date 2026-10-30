import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../domain/policies/reader_promotion_news_publisher_policy.dart';
import '../../domain/policies/reader_promotion_ranking_policy.dart';
import '../../domain/policies/reader_promotion_source_registry.dart';
import '../../domain/value_objects/reader_promotion_comparator.dart';
import '../api/summary_api_dto.dart';
import 'reader_display_headline_verifier.dart';
import 'reader_promotion_canonical_json.dart';
import 'reader_promotion_comparator_schema.dart';

part 'reader_post_promotion_attestation_schema.dart';
part 'reader_post_promotion_attestation_semantics.dart';
part 'reader_post_promotion_attestation_v2_schema.dart';
part 'reader_post_promotion_attestation_v3_schema.dart';
part 'reader_post_promotion_attestation_v3_assessment.dart';
part 'reader_post_promotion_attestation_v3_comparator.dart';

const readerPostPromotionAttestationSchemaV1 =
    'reader_post_promotion_attestation.v1';
const readerPostPromotionAttestationSchemaVersion =
    'reader_post_promotion_attestation.v2';
const readerPostPromotionPolicyV1 = 'reader_post_promotion.v1';
const readerPostPromotionPolicyVersion = 'reader_post_promotion.v2';
const readerPromotionEditorialSlatePolicyVersion = 'reader_promotion_policy.v2';
const readerPostPromotionDigestV1 = 'reader_post_promotion_digest.sha256.v1';
const readerPostPromotionDigestVersion =
    'reader_post_promotion_digest.sha256.v2';
const readerPostPromotionAttestationSchemaV3 =
    'reader_post_promotion_attestation.v3';

/// Meaning of the V3 promotion order (`READER_PROMOTION_POLICY_STAMP`). A V3
/// attestation with any other stamp is rejected: the backend serves days
/// ranked under an older stamp with empty boards and
/// `freshness.reason = ranking_policy_changed` instead.
const readerPromotionPolicyStamp = 'reader_promotion.2026-10-30';
const readerPostPromotionDigestV3 = 'reader_post_promotion_digest.sha256.v3';

ReaderPostPromotionAttestationApiDto? verifyReaderPostPromotionAttestation({
  required String? schemaVersion,
  required String? policyVersion,
  required String? digestVersion,
  required String digest,
  required String canonicalPayload,
  required String candidateId,
  required String canonicalIdentity,
  required String? placement,
  required String artifactId,
  required String sourceWindowId,
  required String enclosingArtifactId,
  required String enclosingSourceWindowId,
  required DateTime enclosingPeriodStart,
  required DateTime enclosingPeriodEnd,
  required DateTime? enclosingIngestionCutoff,
  String? enclosingExactIngestionCutoff,
  required int slot,
  required String? decision,
  required List<String> citationIds,
  String? storyClusterId,
  ReaderPostPromotionScoreComponentsApiDto? scoreComponents,
  List<String>? reasonCodes,
  String? candidateDigestInput,
  String? slateEntryDigestInput,
  String? slateDigestInput,
  String? slateDigest,
  ReaderPostPromotionEvidenceLineageApiDto? evidenceLineage,
  Object? displayHeadline,
  Object? capturedSource,
  Object? displayHeadlineSeal,
  String? displaySummary,
  String? displaySummarySeal,
  String? cardTitle,
  String? tenantId,
  String? workspaceId,
  String? sourceItemId,
  String? sourceCandidateId,
  String? cardProviderKey,
  String? cardStoryClusterId,
  DateTime? cardPublishedAt,
  List<String>? cardCitationIds,
  num? cardSignalScore,
  Object? outerProvider,
  Object? outerStoryId,
  Object? outerPublishedAt,
  Object? outerPeriodStartedAt,
  Object? outerPeriodEndedAt,
  Object? outerIngestionCutoff,
  Object? outerExactIngestionCutoff,
  Object? outerAssessment,
  Object? outerComparator,
  Object? outerPresentation,
}) {
  final normalizedCandidateId = candidateId.trim();
  final normalizedCanonicalIdentity = canonicalIdentity.trim();
  if (placement == null || enclosingIngestionCutoff == null) {
    return null;
  }
  final isV1 =
      schemaVersion == readerPostPromotionAttestationSchemaV1 &&
      policyVersion == readerPostPromotionPolicyV1 &&
      digestVersion == readerPostPromotionDigestV1;
  final isV2 =
      schemaVersion == readerPostPromotionAttestationSchemaVersion &&
      policyVersion == readerPostPromotionPolicyVersion &&
      digestVersion == readerPostPromotionDigestVersion;
  final isV3Transport =
      schemaVersion == readerPostPromotionAttestationSchemaV3 &&
      policyVersion == readerPromotionPolicyStamp &&
      digestVersion == readerPostPromotionDigestV3;
  if ((!isV1 && !isV2 && !isV3Transport) ||
      normalizedCandidateId.isEmpty ||
      normalizedCanonicalIdentity.isEmpty ||
      slot < (isV1 ? 0 : 1) ||
      // "News without rating" exists only under the V3 policy stamp.
      !{'top', 'additional', if (isV3Transport) 'news'}.contains(placement)) {
    return null;
  }
  final expectedDigest = sha256
      .convert(utf8.encode(canonicalPayload))
      .toString();
  if (digest != expectedDigest) {
    return null;
  }
  final Object? decoded;
  try {
    decoded = jsonDecode(canonicalPayload);
  } on FormatException {
    return null;
  }
  if (decoded is! Map<String, Object?>) return null;
  final canonicalSchema = decoded['schemaVersion'];
  final isV3 = canonicalSchema == readerPostPromotionAttestationSchemaV3;
  if (isV3) {
    if (!isV3Transport) {
      return null;
    }
    return _verifyReaderPostPromotionAttestationV3(
      decoded: decoded,
      digest: digest,
      canonicalPayload: canonicalPayload,
      candidateId: candidateId,
      canonicalIdentity: canonicalIdentity,
      artifactId: artifactId,
      sourceWindowId: sourceWindowId,
      enclosingArtifactId: enclosingArtifactId,
      enclosingSourceWindowId: enclosingSourceWindowId,
      enclosingPeriodStart: enclosingPeriodStart,
      enclosingPeriodEnd: enclosingPeriodEnd,
      enclosingIngestionCutoff: enclosingIngestionCutoff,
      enclosingExactIngestionCutoff: enclosingExactIngestionCutoff,
      placement: placement,
      slot: slot,
      decision: decision,
      citationIds: citationIds,
      displayHeadline: displayHeadline,
      capturedSource: capturedSource,
      cardTitle: cardTitle,
      tenantId: tenantId,
      workspaceId: workspaceId,
      sourceItemId: sourceItemId,
      sourceCandidateId: sourceCandidateId,
      cardProviderKey: cardProviderKey,
      cardStoryClusterId: cardStoryClusterId,
      cardPublishedAt: cardPublishedAt,
      cardCitationIds: cardCitationIds,
      cardSignalScore: cardSignalScore,
      outerProvider: outerProvider,
      outerStoryId: outerStoryId,
      outerPublishedAt: outerPublishedAt,
      outerPeriodStartedAt: outerPeriodStartedAt,
      outerPeriodEndedAt: outerPeriodEndedAt,
      outerIngestionCutoff: outerIngestionCutoff,
      outerExactIngestionCutoff: outerExactIngestionCutoff,
      outerAssessment: outerAssessment,
      outerComparator: outerComparator,
      outerPresentation: outerPresentation,
    );
  }
  if (!_validCanonicalBody(decoded, isV2: isV2)) return null;
  if (!_validPromotionSemantics(decoded)) return null;
  if (!verifyReaderDisplayHeadline(
    payload: decoded,
    headline: displayHeadline,
    source: capturedSource,
    outerSeal: displayHeadlineSeal,
    title: cardTitle,
    providerKey: cardProviderKey,
    tenantId: tenantId,
    workspaceId: workspaceId,
    sourceItemId: sourceItemId,
    sourceCandidateId: sourceCandidateId,
  )) {
    return null;
  }
  if (decoded['displaySummary'] != displaySummarySeal ||
      displaySummary != displaySummarySeal ||
      (displaySummarySeal != null &&
          (displaySummarySeal.trim().isEmpty ||
              displaySummarySeal.length > 300))) {
    return null;
  }
  final payloadCitationIds = decoded['citationIds'];
  if (payloadCitationIds is! List<Object?> ||
      payloadCitationIds.any((value) => value is! String) ||
      !_sameOrderedStrings(payloadCitationIds.cast<String>(), citationIds) ||
      decoded['schemaVersion'] != schemaVersion ||
      decoded['policyVersion'] != policyVersion ||
      decoded['digestVersion'] != digestVersion ||
      decoded['artifactId'] != artifactId ||
      decoded['sourceWindowId'] != sourceWindowId ||
      artifactId != enclosingArtifactId ||
      sourceWindowId != enclosingSourceWindowId ||
      decoded['periodStartedAt'] !=
          enclosingPeriodStart.toUtc().toIso8601String() ||
      decoded['periodEndedAt'] !=
          enclosingPeriodEnd.toUtc().toIso8601String() ||
      decoded['ingestionCutoff'] !=
          enclosingIngestionCutoff.toUtc().toIso8601String() ||
      decoded['slot'] != slot ||
      decoded['candidateId'] != candidateId ||
      decoded['canonicalIdentity'] != canonicalIdentity ||
      decoded['placement'] != placement ||
      decoded['decision'] != decision) {
    return null;
  }
  if ((cardProviderKey != null && decoded['provider'] != cardProviderKey) ||
      (isV2 && cardStoryClusterId != storyClusterId) ||
      (cardPublishedAt != null &&
          decoded['publishedAt'] !=
              cardPublishedAt.toUtc().toIso8601String()) ||
      (cardCitationIds != null &&
          !_sameOrderedStrings(
            payloadCitationIds.cast<String>(),
            cardCitationIds,
          ))) {
    return null;
  }
  if (isV2 &&
      !_validV2OuterBinding(
        decoded,
        storyClusterId: storyClusterId,
        scoreComponents: scoreComponents,
        reasonCodes: reasonCodes,
        candidateDigestInput: candidateDigestInput,
        slateEntryDigestInput: slateEntryDigestInput,
        slateDigestInput: slateDigestInput,
        slateDigest: slateDigest,
        evidenceLineage: evidenceLineage,
      )) {
    return null;
  }
  if (isV1 &&
      (storyClusterId != null ||
          scoreComponents != null ||
          reasonCodes != null ||
          candidateDigestInput != null ||
          slateEntryDigestInput != null ||
          slateDigestInput != null ||
          slateDigest != null ||
          evidenceLineage != null)) {
    return null;
  }
  return ReaderPostPromotionAttestationApiDto(
    schemaVersion: schemaVersion!,
    policyVersion: policyVersion!,
    candidateId: normalizedCandidateId,
    canonicalIdentity: normalizedCanonicalIdentity,
    placement: placement,
    slot: slot,
    decision: decision!,
    citationIds: List.unmodifiable(citationIds),
    storyClusterId: storyClusterId,
    scoreComponents: scoreComponents,
    reasonCodes: List.unmodifiable(reasonCodes ?? const []),
    candidateDigestInput: candidateDigestInput,
    slateEntryDigestInput: slateEntryDigestInput,
    slateDigestInput: slateDigestInput,
    slateDigest: slateDigest,
    evidenceLineage: evidenceLineage,
  );
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
const _bodyOptionalKeys = <String>{
  'checkedAt',
  'authorityAttestation',
  'relationTrace',
  'exactPublishedAt',
  'exactObservedAt',
  'exactPeriodStart',
  'exactPeriodEnd',
  'exactIngestionCutoff',
};

const _bodyV2RequiredKeys = <String>{
  'storyClusterId',
  'scoreComponents',
  'reasonCodes',
  'candidateDigestInput',
  'slateEntryDigestInput',
  'slateDigestInput',
  'slateDigest',
  'evidenceLineage',
};
