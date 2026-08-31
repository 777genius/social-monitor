// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_evidence_lineage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionEvidenceLineageDto
_$ReaderSummaryPromotionEvidenceLineageDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryPromotionEvidenceLineageDto(
      citationIds: (json['citationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      leadCandidateId: json['leadCandidateId'] as String,
      leadCitationId: json['leadCitationId'] as String,
      supportCandidateIds: (json['supportCandidateIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      supportCitationIds: (json['supportCitationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$ReaderSummaryPromotionEvidenceLineageDtoToJson(
  ReaderSummaryPromotionEvidenceLineageDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'leadCandidateId': instance.leadCandidateId,
  'leadCitationId': instance.leadCitationId,
  'supportCandidateIds': instance.supportCandidateIds,
  'supportCitationIds': instance.supportCitationIds,
};
