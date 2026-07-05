// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_quality_rejection_top_read_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryQualityRejectionTopReadDto
_$ReaderSummaryQualityRejectionTopReadDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryQualityRejectionTopReadDto(
      citationIds: (json['citationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      title: json['title'] as String,
      canonicalUrl: json['canonicalUrl'] as String?,
      providerKey: json['providerKey'] as String?,
    );

Map<String, dynamic> _$ReaderSummaryQualityRejectionTopReadDtoToJson(
  ReaderSummaryQualityRejectionTopReadDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationIds': instance.citationIds,
  'providerKey': instance.providerKey,
  'title': instance.title,
};
