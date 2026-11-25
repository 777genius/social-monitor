// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_story_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionStoryDto
_$ReaderSummaryWeeklyProjectionStoryDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryWeeklyProjectionStoryDto(
      citationIds: (json['citationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      headline: json['headline'] as String,
      observedFrom: DateTime.parse(json['observedFrom'] as String),
      observedThrough: DateTime.parse(json['observedThrough'] as String),
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
  'observedFrom': instance.observedFrom.toIso8601String(),
  'observedThrough': instance.observedThrough.toIso8601String(),
  'status': instance.status,
  'storyId': instance.storyId,
  'summary': instance.summary,
};
