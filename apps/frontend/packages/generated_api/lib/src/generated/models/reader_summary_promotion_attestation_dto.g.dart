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
  candidateDigestInput: json['candidateDigestInput'] as String?,
  evidenceLineage: json['evidenceLineage'] == null
      ? null
      : ReaderSummaryPromotionEvidenceLineageDto.fromJson(
          json['evidenceLineage'] as Map<String, dynamic>,
        ),
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
);

Map<String, dynamic> _$ReaderSummaryPromotionAttestationDtoToJson(
  ReaderSummaryPromotionAttestationDto instance,
) => <String, dynamic>{
  'artifactId': instance.artifactId,
  'candidateDigestInput': instance.candidateDigestInput,
  'candidateId': instance.candidateId,
  'canonicalIdentity': instance.canonicalIdentity,
  'canonicalPayload': instance.canonicalPayload,
  'citationIds': instance.citationIds,
  'decision': instance.decision,
  'digest': instance.digest,
  'digestVersion': instance.digestVersion,
  'evidenceLineage': instance.evidenceLineage,
  'placement': instance.placement,
  'policyVersion': instance.policyVersion,
  'reasonCodes': instance.reasonCodes,
  'schemaVersion': instance.schemaVersion,
  'scoreComponents': instance.scoreComponents,
  'slateDigest': instance.slateDigest,
  'slateDigestInput': instance.slateDigestInput,
  'slateEntryDigestInput': instance.slateEntryDigestInput,
  'slot': instance.slot,
  'sourceWindowId': instance.sourceWindowId,
  'storyClusterId': instance.storyClusterId,
};
