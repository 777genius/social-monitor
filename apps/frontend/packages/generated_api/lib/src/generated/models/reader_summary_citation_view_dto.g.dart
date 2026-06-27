// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_citation_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryCitationViewDto _$ReaderSummaryCitationViewDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryCitationViewDto(
  citationId: json['citationId'] as String,
  feedItemId: json['feedItemId'] as String,
  field: ReaderSummaryCitationViewDtoFieldField.fromJson(
    json['field'] as String,
  ),
  label: json['label'] as String,
  providerKey: json['providerKey'] as String,
  sourceItemId: json['sourceItemId'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
);

Map<String, dynamic> _$ReaderSummaryCitationViewDtoToJson(
  ReaderSummaryCitationViewDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationId': instance.citationId,
  'feedItemId': instance.feedItemId,
  'field': instance.field,
  'label': instance.label,
  'providerKey': instance.providerKey,
  'sourceItemId': instance.sourceItemId,
};
