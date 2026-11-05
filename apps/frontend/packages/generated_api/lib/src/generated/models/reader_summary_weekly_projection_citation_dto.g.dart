// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_citation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionCitationDto
_$ReaderSummaryWeeklyProjectionCitationDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryWeeklyProjectionCitationDto(
      canonicalUrl: json['canonicalUrl'] as String,
      citationId: json['citationId'] as String,
      feedItemId: json['feedItemId'] as String,
      providerItemId: json['providerItemId'] as String,
      providerKey: json['providerKey'] as String,
      publicationId: json['publicationId'] as String,
      requestedUtcDate: DateTime.parse(json['requestedUtcDate'] as String),
      sourceBindingId: json['sourceBindingId'] as String,
      sourceContentHash: json['sourceContentHash'] as String,
      sourceItemId: json['sourceItemId'] as String,
    );

Map<String, dynamic> _$ReaderSummaryWeeklyProjectionCitationDtoToJson(
  ReaderSummaryWeeklyProjectionCitationDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationId': instance.citationId,
  'feedItemId': instance.feedItemId,
  'providerItemId': instance.providerItemId,
  'providerKey': instance.providerKey,
  'publicationId': instance.publicationId,
  'requestedUtcDate': instance.requestedUtcDate.toIso8601String(),
  'sourceBindingId': instance.sourceBindingId,
  'sourceContentHash': instance.sourceContentHash,
  'sourceItemId': instance.sourceItemId,
};
