// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_citation_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingCitationViewDto _$BriefingCitationViewDtoFromJson(
  Map<String, dynamic> json,
) => BriefingCitationViewDto(
  citationId: json['citationId'] as String,
  feedItemId: json['feedItemId'] as String,
  field: BriefingCitationViewDtoFieldField.fromJson(json['field'] as String),
  label: json['label'] as String,
  providerKey: json['providerKey'] as String,
  sourceItemId: json['sourceItemId'] as String,
);

Map<String, dynamic> _$BriefingCitationViewDtoToJson(
  BriefingCitationViewDto instance,
) => <String, dynamic>{
  'citationId': instance.citationId,
  'feedItemId': instance.feedItemId,
  'field': instance.field,
  'label': instance.label,
  'providerKey': instance.providerKey,
  'sourceItemId': instance.sourceItemId,
};
