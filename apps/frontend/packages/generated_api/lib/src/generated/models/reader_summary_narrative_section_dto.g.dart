// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_narrative_section_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryNarrativeSectionDto _$ReaderSummaryNarrativeSectionDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryNarrativeSectionDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  id: json['id'] as String,
  kind: ReaderSummaryNarrativeSectionDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  text: json['text'] as String,
  title: json['title'] as String,
  storyClusterId: json['storyClusterId'] as String?,
);

Map<String, dynamic> _$ReaderSummaryNarrativeSectionDtoToJson(
  ReaderSummaryNarrativeSectionDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'id': instance.id,
  'kind': instance.kind,
  'storyClusterId': instance.storyClusterId,
  'text': instance.text,
  'title': instance.title,
};
