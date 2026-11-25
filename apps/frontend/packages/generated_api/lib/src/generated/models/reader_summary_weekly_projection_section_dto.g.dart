// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_section_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionSectionDto
_$ReaderSummaryWeeklyProjectionSectionDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryWeeklyProjectionSectionDto(
      citationIds: (json['citationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      claimType:
          ReaderSummaryWeeklyProjectionSectionDtoClaimTypeClaimType.fromJson(
            json['claimType'] as String,
          ),
      heading: json['heading'] as String,
      kind: ReaderSummaryWeeklyProjectionSectionDtoKindKind.fromJson(
        json['kind'] as String,
      ),
      observedFrom: DateTime.parse(json['observedFrom'] as String),
      observedThrough: DateTime.parse(json['observedThrough'] as String),
      sectionId: json['sectionId'] as String,
      storyId: json['storyId'] as String,
      text: json['text'] as String,
    );

Map<String, dynamic> _$ReaderSummaryWeeklyProjectionSectionDtoToJson(
  ReaderSummaryWeeklyProjectionSectionDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'claimType': instance.claimType,
  'heading': instance.heading,
  'kind': instance.kind,
  'observedFrom': instance.observedFrom.toIso8601String(),
  'observedThrough': instance.observedThrough.toIso8601String(),
  'sectionId': instance.sectionId,
  'storyId': instance.storyId,
  'text': instance.text,
};
