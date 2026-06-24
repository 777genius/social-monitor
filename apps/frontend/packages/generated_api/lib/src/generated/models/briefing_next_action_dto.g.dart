// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_next_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingNextActionDto _$BriefingNextActionDtoFromJson(
  Map<String, dynamic> json,
) => BriefingNextActionDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  kind: BriefingNextActionDtoKindKind.fromJson(json['kind'] as String),
  label: json['label'] as String,
  reason: json['reason'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
);

Map<String, dynamic> _$BriefingNextActionDtoToJson(
  BriefingNextActionDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationIds': instance.citationIds,
  'kind': instance.kind,
  'label': instance.label,
  'reason': instance.reason,
};
