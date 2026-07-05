// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_quality_rejection_citation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryQualityRejectionCitationDto
_$ReaderSummaryQualityRejectionCitationDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryQualityRejectionCitationDto(
      citationId: json['citationId'] as String,
      feedItemId: json['feedItemId'] as String,
      providerKey: json['providerKey'] as String,
      sourceItemId: json['sourceItemId'] as String,
      canonicalUrl: json['canonicalUrl'] as String?,
    );

Map<String, dynamic> _$ReaderSummaryQualityRejectionCitationDtoToJson(
  ReaderSummaryQualityRejectionCitationDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationId': instance.citationId,
  'feedItemId': instance.feedItemId,
  'providerKey': instance.providerKey,
  'sourceItemId': instance.sourceItemId,
};
