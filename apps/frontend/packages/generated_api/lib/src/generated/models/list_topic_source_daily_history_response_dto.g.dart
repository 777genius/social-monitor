// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_topic_source_daily_history_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListTopicSourceDailyHistoryResponseDto
_$ListTopicSourceDailyHistoryResponseDtoFromJson(Map<String, dynamic> json) =>
    ListTopicSourceDailyHistoryResponseDto(
      days: (json['days'] as List<dynamic>)
          .map(
            (e) => TopicSourceDailyHistoryDayResponseDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      maxScanJobs: json['maxScanJobs'] as num,
      summary: TopicSourceDailyHistorySummaryResponseDto.fromJson(
        json['summary'] as Map<String, dynamic>,
      ),
      topicId: json['topicId'] as String,
      truncated: json['truncated'] as bool,
      windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
      windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
    );

Map<String, dynamic> _$ListTopicSourceDailyHistoryResponseDtoToJson(
  ListTopicSourceDailyHistoryResponseDto instance,
) => <String, dynamic>{
  'days': instance.days,
  'maxScanJobs': instance.maxScanJobs,
  'summary': instance.summary,
  'topicId': instance.topicId,
  'truncated': instance.truncated,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
