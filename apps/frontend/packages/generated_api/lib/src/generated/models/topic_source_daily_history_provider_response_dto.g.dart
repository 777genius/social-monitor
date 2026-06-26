// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'topic_source_daily_history_provider_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TopicSourceDailyHistoryProviderResponseDto
_$TopicSourceDailyHistoryProviderResponseDtoFromJson(
  Map<String, dynamic> json,
) => TopicSourceDailyHistoryProviderResponseDto(
  activeScans: json['activeScans'] as num,
  configuredSourceBindingCount: json['configuredSourceBindingCount'] as num,
  consecutiveFailures: json['consecutiveFailures'] as num,
  enabledSourceBindingCount: json['enabledSourceBindingCount'] as num,
  failedScans: json['failedScans'] as num,
  fetched: json['fetched'] as num,
  inserted: json['inserted'] as num,
  operatorAction: json['operatorAction'] as String,
  pausedSourceBindingCount: json['pausedSourceBindingCount'] as num,
  projected: json['projected'] as num,
  providerHealthState:
      TopicSourceDailyHistoryProviderResponseDtoProviderHealthStateProviderHealthState.fromJson(
        json['providerHealthState'] as String,
      ),
  providerKey: json['providerKey'] as String,
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitedScans: json['rateLimitedScans'] as num,
  scanCoverageState:
      TopicSourceDailyHistoryProviderResponseDtoScanCoverageStateScanCoverageState.fromJson(
        json['scanCoverageState'] as String,
      ),
  scannedSourceBindingCount: json['scannedSourceBindingCount'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  skippedDuplicates: json['skippedDuplicates'] as num,
  sourceBindingCount: json['sourceBindingCount'] as num,
  succeededScans: json['succeededScans'] as num,
  totalScans: json['totalScans'] as num,
  unconfiguredSourceBindingCount: json['unconfiguredSourceBindingCount'] as num,
  unscannedSourceBindingCount: json['unscannedSourceBindingCount'] as num,
  cadenceSummary: json['cadenceSummary'] == null
      ? null
      : TopicSourceDailyHistoryCadenceSummaryResponseDto.fromJson(
          json['cadenceSummary'] as Map<String, dynamic>,
        ),
  lastCompletedAt: json['lastCompletedAt'] == null
      ? null
      : DateTime.parse(json['lastCompletedAt'] as String),
  lastScanRequestedAt: json['lastScanRequestedAt'] == null
      ? null
      : DateTime.parse(json['lastScanRequestedAt'] as String),
);

Map<String, dynamic> _$TopicSourceDailyHistoryProviderResponseDtoToJson(
  TopicSourceDailyHistoryProviderResponseDto instance,
) => <String, dynamic>{
  'activeScans': instance.activeScans,
  'cadenceSummary': instance.cadenceSummary,
  'configuredSourceBindingCount': instance.configuredSourceBindingCount,
  'consecutiveFailures': instance.consecutiveFailures,
  'enabledSourceBindingCount': instance.enabledSourceBindingCount,
  'failedScans': instance.failedScans,
  'fetched': instance.fetched,
  'inserted': instance.inserted,
  'lastCompletedAt': instance.lastCompletedAt?.toIso8601String(),
  'lastScanRequestedAt': instance.lastScanRequestedAt?.toIso8601String(),
  'operatorAction': instance.operatorAction,
  'pausedSourceBindingCount': instance.pausedSourceBindingCount,
  'projected': instance.projected,
  'providerHealthState': instance.providerHealthState,
  'providerKey': instance.providerKey,
  'providerUnavailableScans': instance.providerUnavailableScans,
  'rateLimitedScans': instance.rateLimitedScans,
  'scanCoverageState': instance.scanCoverageState,
  'scannedSourceBindingCount': instance.scannedSourceBindingCount,
  'signals': instance.signals,
  'skippedDuplicates': instance.skippedDuplicates,
  'sourceBindingCount': instance.sourceBindingCount,
  'succeededScans': instance.succeededScans,
  'totalScans': instance.totalScans,
  'unconfiguredSourceBindingCount': instance.unconfiguredSourceBindingCount,
  'unscannedSourceBindingCount': instance.unscannedSourceBindingCount,
};
