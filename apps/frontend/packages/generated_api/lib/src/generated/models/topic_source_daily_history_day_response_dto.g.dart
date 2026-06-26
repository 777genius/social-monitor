// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'topic_source_daily_history_day_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TopicSourceDailyHistoryDayResponseDto
_$TopicSourceDailyHistoryDayResponseDtoFromJson(
  Map<String, dynamic> json,
) => TopicSourceDailyHistoryDayResponseDto(
  activeScans: json['activeScans'] as num,
  consecutiveFailures: json['consecutiveFailures'] as num,
  date: json['date'] as String,
  failedScans: json['failedScans'] as num,
  fetched: json['fetched'] as num,
  inserted: json['inserted'] as num,
  operatorAction: json['operatorAction'] as String,
  projected: json['projected'] as num,
  providerBreakdown: (json['providerBreakdown'] as List<dynamic>)
      .map(
        (e) => TopicSourceDailyHistoryProviderResponseDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  providerHealthState:
      TopicSourceDailyHistoryDayResponseDtoProviderHealthStateProviderHealthState.fromJson(
        json['providerHealthState'] as String,
      ),
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitedScans: json['rateLimitedScans'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  skippedDuplicates: json['skippedDuplicates'] as num,
  sourceBindingCount: json['sourceBindingCount'] as num,
  succeededScans: json['succeededScans'] as num,
  totalScans: json['totalScans'] as num,
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
  lastCompletedAt: json['lastCompletedAt'] == null
      ? null
      : DateTime.parse(json['lastCompletedAt'] as String),
  lastScanRequestedAt: json['lastScanRequestedAt'] == null
      ? null
      : DateTime.parse(json['lastScanRequestedAt'] as String),
);

Map<String, dynamic> _$TopicSourceDailyHistoryDayResponseDtoToJson(
  TopicSourceDailyHistoryDayResponseDto instance,
) => <String, dynamic>{
  'activeScans': instance.activeScans,
  'consecutiveFailures': instance.consecutiveFailures,
  'date': instance.date,
  'failedScans': instance.failedScans,
  'fetched': instance.fetched,
  'inserted': instance.inserted,
  'lastCompletedAt': instance.lastCompletedAt?.toIso8601String(),
  'lastScanRequestedAt': instance.lastScanRequestedAt?.toIso8601String(),
  'operatorAction': instance.operatorAction,
  'projected': instance.projected,
  'providerBreakdown': instance.providerBreakdown,
  'providerHealthState': instance.providerHealthState,
  'providerUnavailableScans': instance.providerUnavailableScans,
  'rateLimitedScans': instance.rateLimitedScans,
  'signals': instance.signals,
  'skippedDuplicates': instance.skippedDuplicates,
  'sourceBindingCount': instance.sourceBindingCount,
  'succeededScans': instance.succeededScans,
  'totalScans': instance.totalScans,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
