// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_attestation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionAttestationDto
_$ReaderSummaryPromotionAttestationDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryPromotionAttestationDto(
  artifactId: json['artifactId'] as String,
  candidateId: json['candidateId'] as String,
  canonicalIdentity: json['canonicalIdentity'] as String,
  canonicalPayload: json['canonicalPayload'] as String,
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  decision: ReaderSummaryPromotionAttestationDtoDecisionDecision.fromJson(
    json['decision'] as String,
  ),
  digest: json['digest'] as String,
  digestVersion:
      ReaderSummaryPromotionAttestationDtoDigestVersionDigestVersion.fromJson(
        json['digestVersion'] as String,
      ),
  placement: ReaderSummaryPromotionAttestationDtoPlacementPlacement.fromJson(
    json['placement'] as String,
  ),
  policyVersion:
      ReaderSummaryPromotionAttestationDtoPolicyVersionPolicyVersion.fromJson(
        json['policyVersion'] as String,
      ),
  schemaVersion:
      ReaderSummaryPromotionAttestationDtoSchemaVersionSchemaVersion.fromJson(
        json['schemaVersion'] as String,
      ),
  slot: json['slot'] as num,
  sourceWindowId: json['sourceWindowId'] as String,
  assessment: json['assessment'] == null
      ? null
      : ReaderSummaryPromotionV3AssessmentDto.fromJson(
          json['assessment'] as Map<String, dynamic>,
        ),
  candidateDigestInput: json['candidateDigestInput'] as String?,
  comparator: json['comparator'] == null
      ? null
      : ReaderSummaryPromotionV3ComparatorDto.fromJson(
          json['comparator'] as Map<String, dynamic>,
        ),
  displayHeadline: json['displayHeadline'] == null
      ? null
      : ReaderSummaryDisplayHeadlineSealDto.fromJson(
          json['displayHeadline'] as Map<String, dynamic>,
        ),
  displaySummary: json['displaySummary'] as String?,
  evidenceLineage: json['evidenceLineage'] == null
      ? null
      : ReaderSummaryPromotionEvidenceLineageDto.fromJson(
          json['evidenceLineage'] as Map<String, dynamic>,
        ),
  exactIngestionCutoff: json['exactIngestionCutoff'] as String?,
  ingestionCutoff: json['ingestionCutoff'] == null
      ? null
      : DateTime.parse(json['ingestionCutoff'] as String),
  periodEndedAt: json['periodEndedAt'] == null
      ? null
      : DateTime.parse(json['periodEndedAt'] as String),
  periodStartedAt: json['periodStartedAt'] == null
      ? null
      : DateTime.parse(json['periodStartedAt'] as String),
  presentation: json['presentation'] == null
      ? null
      : ReaderSummaryPromotionV3PresentationDto.fromJson(
          json['presentation'] as Map<String, dynamic>,
        ),
  provider: json['provider'] as String?,
  publishedAt: json['publishedAt'] as String?,
  reasonCodes: (json['reasonCodes'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  scoreComponents: json['scoreComponents'] == null
      ? null
      : ReaderSummaryPromotionScoreComponentsDto.fromJson(
          json['scoreComponents'] as Map<String, dynamic>,
        ),
  slateDigest: json['slateDigest'] as String?,
  slateDigestInput: json['slateDigestInput'] as String?,
  slateEntryDigestInput: json['slateEntryDigestInput'] as String?,
  storyClusterId: json['storyClusterId'] as String?,
  storyId: json['storyId'] as String?,
);

Map<String, dynamic> _$ReaderSummaryPromotionAttestationDtoToJson(
  ReaderSummaryPromotionAttestationDto instance,
) => <String, dynamic>{
  'artifactId': instance.artifactId,
  'assessment': instance.assessment,
  'candidateDigestInput': instance.candidateDigestInput,
  'candidateId': instance.candidateId,
  'canonicalIdentity': instance.canonicalIdentity,
  'canonicalPayload': instance.canonicalPayload,
  'citationIds': instance.citationIds,
  'comparator': instance.comparator,
  'decision': instance.decision,
  'digest': instance.digest,
  'digestVersion': instance.digestVersion,
  'displayHeadline': instance.displayHeadline,
  'displaySummary': instance.displaySummary,
  'evidenceLineage': instance.evidenceLineage,
  'exactIngestionCutoff': instance.exactIngestionCutoff,
  'ingestionCutoff': instance.ingestionCutoff?.toIso8601String(),
  'periodEndedAt': instance.periodEndedAt?.toIso8601String(),
  'periodStartedAt': instance.periodStartedAt?.toIso8601String(),
  'placement': instance.placement,
  'policyVersion': instance.policyVersion,
  'presentation': instance.presentation,
  'provider': instance.provider,
  'publishedAt': instance.publishedAt,
  'reasonCodes': instance.reasonCodes,
  'schemaVersion': instance.schemaVersion,
  'scoreComponents': instance.scoreComponents,
  'slateDigest': instance.slateDigest,
  'slateDigestInput': instance.slateDigestInput,
  'slateEntryDigestInput': instance.slateEntryDigestInput,
  'slot': instance.slot,
  'sourceWindowId': instance.sourceWindowId,
  'storyClusterId': instance.storyClusterId,
  'storyId': instance.storyId,
};
