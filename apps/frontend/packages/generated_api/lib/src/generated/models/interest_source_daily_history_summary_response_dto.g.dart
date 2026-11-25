// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_source_daily_history_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestSourceDailyHistorySummaryResponseDto
_$InterestSourceDailyHistorySummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => InterestSourceDailyHistorySummaryResponseDto(
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
        (e) => InterestSourceDailyHistoryProviderResponseDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  providerHealthState:
      InterestSourceDailyHistorySummaryResponseDtoProviderHealthStateProviderHealthState.fromJson(
        json['providerHealthState'] as String,
      ),
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitedScans: json['rateLimitedScans'] as num,
  scanCoverageState:
      InterestSourceDailyHistorySummaryResponseDtoScanCoverageStateScanCoverageState.fromJson(
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

Map<String, dynamic> _$InterestSourceDailyHistorySummaryResponseDtoToJson(
  InterestSourceDailyHistorySummaryResponseDto instance,
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
};
