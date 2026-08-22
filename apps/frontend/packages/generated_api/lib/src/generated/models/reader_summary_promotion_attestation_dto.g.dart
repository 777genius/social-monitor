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
);

Map<String, dynamic> _$ReaderSummaryPromotionAttestationDtoToJson(
  ReaderSummaryPromotionAttestationDto instance,
) => <String, dynamic>{
  'artifactId': instance.artifactId,
  'candidateId': instance.candidateId,
  'canonicalIdentity': instance.canonicalIdentity,
  'canonicalPayload': instance.canonicalPayload,
  'citationIds': instance.citationIds,
  'decision': instance.decision,
  'digest': instance.digest,
  'digestVersion': instance.digestVersion,
  'placement': instance.placement,
  'policyVersion': instance.policyVersion,
  'schemaVersion': instance.schemaVersion,
  'slot': instance.slot,
  'sourceWindowId': instance.sourceWindowId,
};
