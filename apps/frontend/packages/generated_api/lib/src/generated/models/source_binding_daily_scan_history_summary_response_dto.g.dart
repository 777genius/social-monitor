// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_daily_scan_history_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingDailyScanHistorySummaryResponseDto
_$SourceBindingDailyScanHistorySummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingDailyScanHistorySummaryResponseDto(
  activeScans: json['activeScans'] as num,
  consecutiveFailures: json['consecutiveFailures'] as num,
  daysWithFailures: json['daysWithFailures'] as num,
  daysWithRateLimits: json['daysWithRateLimits'] as num,
  daysWithScans: json['daysWithScans'] as num,
  failedScans: json['failedScans'] as num,
  fetched: json['fetched'] as num,
  inserted: json['inserted'] as num,
  operatorAction: json['operatorAction'] as String,
  projected: json['projected'] as num,
  providerHealthState:
      SourceBindingDailyScanHistorySummaryResponseDtoProviderHealthStateProviderHealthState.fromJson(
        json['providerHealthState'] as String,
      ),
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitedScans: json['rateLimitedScans'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  skippedDuplicates: json['skippedDuplicates'] as num,
  succeededScans: json['succeededScans'] as num,
  totalScans: json['totalScans'] as num,
  lastCompletedAt: json['lastCompletedAt'] == null
      ? null
      : DateTime.parse(json['lastCompletedAt'] as String),
  lastScanRequestedAt: json['lastScanRequestedAt'] == null
      ? null
      : DateTime.parse(json['lastScanRequestedAt'] as String),
);

Map<String, dynamic> _$SourceBindingDailyScanHistorySummaryResponseDtoToJson(
  SourceBindingDailyScanHistorySummaryResponseDto instance,
) => <String, dynamic>{
  'activeScans': instance.activeScans,
  'consecutiveFailures': instance.consecutiveFailures,
  'daysWithFailures': instance.daysWithFailures,
  'daysWithRateLimits': instance.daysWithRateLimits,
  'daysWithScans': instance.daysWithScans,
  'failedScans': instance.failedScans,
  'fetched': instance.fetched,
  'inserted': instance.inserted,
  'lastCompletedAt': instance.lastCompletedAt?.toIso8601String(),
  'lastScanRequestedAt': instance.lastScanRequestedAt?.toIso8601String(),
  'operatorAction': instance.operatorAction,
  'projected': instance.projected,
  'providerHealthState': instance.providerHealthState,
  'providerUnavailableScans': instance.providerUnavailableScans,
  'rateLimitedScans': instance.rateLimitedScans,
  'signals': instance.signals,
  'skippedDuplicates': instance.skippedDuplicates,
  'succeededScans': instance.succeededScans,
  'totalScans': instance.totalScans,
};
