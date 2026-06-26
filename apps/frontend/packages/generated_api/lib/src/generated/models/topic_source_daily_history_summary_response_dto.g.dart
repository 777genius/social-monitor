// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'topic_source_daily_history_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TopicSourceDailyHistorySummaryResponseDto
_$TopicSourceDailyHistorySummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => TopicSourceDailyHistorySummaryResponseDto(
  activeScans: json['activeScans'] as num,
  configuredSourceBindingCount: json['configuredSourceBindingCount'] as num,
  consecutiveFailures: json['consecutiveFailures'] as num,
  daysWithFailures: json['daysWithFailures'] as num,
  daysWithRateLimits: json['daysWithRateLimits'] as num,
  daysWithScans: json['daysWithScans'] as num,
  enabledSourceBindingCount: json['enabledSourceBindingCount'] as num,
  failedScans: json['failedScans'] as num,
  fetched: json['fetched'] as num,
  inserted: json['inserted'] as num,
  operatorAction: json['operatorAction'] as String,
  pausedSourceBindingCount: json['pausedSourceBindingCount'] as num,
  projected: json['projected'] as num,
  providerBreakdown: (json['providerBreakdown'] as List<dynamic>)
      .map(
        (e) => TopicSourceDailyHistoryProviderResponseDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  providerHealthState:
      TopicSourceDailyHistorySummaryResponseDtoProviderHealthStateProviderHealthState.fromJson(
        json['providerHealthState'] as String,
      ),
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitedScans: json['rateLimitedScans'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  skippedDuplicates: json['skippedDuplicates'] as num,
  sourceBindingCount: json['sourceBindingCount'] as num,
  succeededScans: json['succeededScans'] as num,
  totalScans: json['totalScans'] as num,
  unconfiguredSourceBindingCount: json['unconfiguredSourceBindingCount'] as num,
  lastCompletedAt: json['lastCompletedAt'] == null
      ? null
      : DateTime.parse(json['lastCompletedAt'] as String),
  lastScanRequestedAt: json['lastScanRequestedAt'] == null
      ? null
      : DateTime.parse(json['lastScanRequestedAt'] as String),
);

Map<String, dynamic> _$TopicSourceDailyHistorySummaryResponseDtoToJson(
  TopicSourceDailyHistorySummaryResponseDto instance,
) => <String, dynamic>{
  'activeScans': instance.activeScans,
  'configuredSourceBindingCount': instance.configuredSourceBindingCount,
  'consecutiveFailures': instance.consecutiveFailures,
  'daysWithFailures': instance.daysWithFailures,
  'daysWithRateLimits': instance.daysWithRateLimits,
  'daysWithScans': instance.daysWithScans,
  'enabledSourceBindingCount': instance.enabledSourceBindingCount,
  'failedScans': instance.failedScans,
  'fetched': instance.fetched,
  'inserted': instance.inserted,
  'lastCompletedAt': instance.lastCompletedAt?.toIso8601String(),
  'lastScanRequestedAt': instance.lastScanRequestedAt?.toIso8601String(),
  'operatorAction': instance.operatorAction,
  'pausedSourceBindingCount': instance.pausedSourceBindingCount,
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
  'unconfiguredSourceBindingCount': instance.unconfiguredSourceBindingCount,
};
