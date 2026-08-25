// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_story_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionStoryDto
_$ReaderSummaryWeeklyProjectionStoryDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryWeeklyProjectionStoryDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  headline: json['headline'] as String,
  observedFrom: json['observedFrom'] as String,
  observedThrough: json['observedThrough'] as String,
  status: ReaderSummaryWeeklyProjectionStoryDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  storyId: json['storyId'] as String,
  summary: json['summary'] as String,
);

Map<String, dynamic> _$ReaderSummaryWeeklyProjectionStoryDtoToJson(
  ReaderSummaryWeeklyProjectionStoryDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'headline': instance.headline,
  'observedFrom': instance.observedFrom,
  'observedThrough': instance.observedThrough,
  'status': instance.status,
  'storyId': instance.storyId,
  'summary': instance.summary,
};
