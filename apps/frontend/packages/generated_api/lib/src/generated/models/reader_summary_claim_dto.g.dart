// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_claim_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryClaimDto _$ReaderSummaryClaimDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryClaimDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  claim: json['claim'] as String,
  confidence: ReaderSummaryReaderItemConfidenceDto.fromJson(
    json['confidence'] as Map<String, dynamic>,
  ),
  evidence: (json['evidence'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryClaimEvidenceDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  risks: (json['risks'] as List<dynamic>)
      .map((e) => ReaderSummaryClaimRiskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  id: json['id'] as String?,
);

Map<String, dynamic> _$ReaderSummaryClaimDtoToJson(
  ReaderSummaryClaimDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'claim': instance.claim,
  'confidence': instance.confidence,
  'evidence': instance.evidence,
  'id': instance.id,
  'risks': instance.risks,
};
