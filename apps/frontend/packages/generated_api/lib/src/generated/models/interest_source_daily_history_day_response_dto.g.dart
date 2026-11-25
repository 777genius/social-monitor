// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_source_daily_history_day_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestSourceDailyHistoryDayResponseDto
_$InterestSourceDailyHistoryDayResponseDtoFromJson(
  Map<String, dynamic> json,
) => InterestSourceDailyHistoryDayResponseDto(
  activeScans: json['activeScans'] as num,
  configuredSourceBindingCount: json['configuredSourceBindingCount'] as num,
  consecutiveFailures: json['consecutiveFailures'] as num,
  date: json['date'] as String,
  enabledSourceBindingCount: json['enabledSourceBindingCount'] as num,
  failedScans: json['failedScans'] as num,
  fetched: json['fetched'] as num,
  inserted: json['inserted'] as num,
  operatorAction: json['operatorAction'] as String,
  pausedSourceBindingCount: json['pausedSourceBindingCount'] as num,
  projected: json['projected'] as num,
  providerBreakdown: (json['providerBreakdown'] as List<dynamic>)
      .map(
        (e) => InterestSourceDailyHistoryProviderResponseDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  providerHealthState:
      InterestSourceDailyHistoryDayResponseDtoProviderHealthStateProviderHealthState.fromJson(
        json['providerHealthState'] as String,
      ),
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitedScans: json['rateLimitedScans'] as num,
  scanCoverageState:
      InterestSourceDailyHistoryDayResponseDtoScanCoverageStateScanCoverageState.fromJson(
        json['scanCoverageState'] as String,
      ),
  scannedSourceBindingCount: json['scannedSourceBindingCount'] as num,
  schedulerDecisionCount: json['schedulerDecisionCount'] as num,
  schedulerEnqueuedCount: json['schedulerEnqueuedCount'] as num,
  schedulerSkippedByReason:
      InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto.fromJson(
        json['schedulerSkippedByReason'] as Map<String, dynamic>,
      ),
  schedulerSkippedCount: json['schedulerSkippedCount'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  skippedDuplicates: json['skippedDuplicates'] as num,
  sourceBindingCount: json['sourceBindingCount'] as num,
  succeededScans: json['succeededScans'] as num,
  totalScans: json['totalScans'] as num,
  unconfiguredSourceBindingCount: json['unconfiguredSourceBindingCount'] as num,
  unscannedSourceBindingCount: json['unscannedSourceBindingCount'] as num,
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
  lastCompletedAt: json['lastCompletedAt'] == null
      ? null
      : DateTime.parse(json['lastCompletedAt'] as String),
  lastScanRequestedAt: json['lastScanRequestedAt'] == null
      ? null
      : DateTime.parse(json['lastScanRequestedAt'] as String),
  lastSchedulerEvaluatedAt: json['lastSchedulerEvaluatedAt'] == null
      ? null
      : DateTime.parse(json['lastSchedulerEvaluatedAt'] as String),
);

Map<String, dynamic> _$InterestSourceDailyHistoryDayResponseDtoToJson(
  InterestSourceDailyHistoryDayResponseDto instance,
) => <String, dynamic>{
  'activeScans': instance.activeScans,
  'configuredSourceBindingCount': instance.configuredSourceBindingCount,
  'consecutiveFailures': instance.consecutiveFailures,
  'date': instance.date,
  'enabledSourceBindingCount': instance.enabledSourceBindingCount,
  'failedScans': instance.failedScans,
  'fetched': instance.fetched,
  'inserted': instance.inserted,
  'lastCompletedAt': instance.lastCompletedAt?.toIso8601String(),
  'lastScanRequestedAt': instance.lastScanRequestedAt?.toIso8601String(),
  'lastSchedulerEvaluatedAt': instance.lastSchedulerEvaluatedAt
      ?.toIso8601String(),
  'operatorAction': instance.operatorAction,
  'pausedSourceBindingCount': instance.pausedSourceBindingCount,
  'projected': instance.projected,
  'providerBreakdown': instance.providerBreakdown,
  'providerHealthState': instance.providerHealthState,
  'providerUnavailableScans': instance.providerUnavailableScans,
  'rateLimitedScans': instance.rateLimitedScans,
  'scanCoverageState': instance.scanCoverageState,
  'scannedSourceBindingCount': instance.scannedSourceBindingCount,
  'schedulerDecisionCount': instance.schedulerDecisionCount,
  'schedulerEnqueuedCount': instance.schedulerEnqueuedCount,
  'schedulerSkippedByReason': instance.schedulerSkippedByReason,
  'schedulerSkippedCount': instance.schedulerSkippedCount,
  'signals': instance.signals,
  'skippedDuplicates': instance.skippedDuplicates,
  'sourceBindingCount': instance.sourceBindingCount,
  'succeededScans': instance.succeededScans,
  'totalScans': instance.totalScans,
  'unconfiguredSourceBindingCount': instance.unconfiguredSourceBindingCount,
  'unscannedSourceBindingCount': instance.unscannedSourceBindingCount,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
