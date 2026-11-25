// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_interest_source_daily_history_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListInterestSourceDailyHistoryResponseDto
_$ListInterestSourceDailyHistoryResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListInterestSourceDailyHistoryResponseDto(
  days: (json['days'] as List<dynamic>)
      .map(
        (e) => InterestSourceDailyHistoryDayResponseDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  interestId: json['interestId'] as String,
  maxScanJobs: json['maxScanJobs'] as num,
  summary: InterestSourceDailyHistorySummaryResponseDto.fromJson(
    json['summary'] as Map<String, dynamic>,
  ),
  truncated: json['truncated'] as bool,
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
);

Map<String, dynamic> _$ListInterestSourceDailyHistoryResponseDtoToJson(
  ListInterestSourceDailyHistoryResponseDto instance,
) => <String, dynamic>{
  'days': instance.days,
  'interestId': instance.interestId,
  'maxScanJobs': instance.maxScanJobs,
  'summary': instance.summary,
  'truncated': instance.truncated,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
