// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_claim_evidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryClaimEvidenceDto _$ReaderSummaryClaimEvidenceDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryClaimEvidenceDto(
  citationId: json['citationId'] as String,
  providerKey: json['providerKey'] as String,
  title: json['title'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
);

Map<String, dynamic> _$ReaderSummaryClaimEvidenceDtoToJson(
  ReaderSummaryClaimEvidenceDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationId': instance.citationId,
  'providerKey': instance.providerKey,
  'title': instance.title,
};
