// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_citation_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryCitationViewDto _$SummaryCitationViewDtoFromJson(
  Map<String, dynamic> json,
) => SummaryCitationViewDto(
  citationId: json['citationId'] as String,
  feedItemId: json['feedItemId'] as String,
  field: SummaryCitationViewDtoFieldField.fromJson(json['field'] as String),
  label: json['label'] as String,
  providerKey: json['providerKey'] as String,
  sourceItemId: json['sourceItemId'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
);

Map<String, dynamic> _$SummaryCitationViewDtoToJson(
  SummaryCitationViewDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationId': instance.citationId,
  'feedItemId': instance.feedItemId,
  'field': instance.field,
  'label': instance.label,
  'providerKey': instance.providerKey,
  'sourceItemId': instance.sourceItemId,
};
