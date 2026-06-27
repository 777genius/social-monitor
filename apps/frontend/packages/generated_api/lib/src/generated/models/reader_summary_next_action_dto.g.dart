// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_next_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryNextActionDto _$ReaderSummaryNextActionDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryNextActionDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  kind: ReaderSummaryNextActionDtoKindKind.fromJson(json['kind'] as String),
  label: json['label'] as String,
  reason: json['reason'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
);

Map<String, dynamic> _$ReaderSummaryNextActionDtoToJson(
  ReaderSummaryNextActionDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationIds': instance.citationIds,
  'kind': instance.kind,
  'label': instance.label,
  'reason': instance.reason,
};
