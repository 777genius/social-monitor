// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_profile_freshness_guard_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceProfileFreshnessGuardDto _$SourceProfileFreshnessGuardDtoFromJson(
  Map<String, dynamic> json,
) => SourceProfileFreshnessGuardDto(
  cursorResumeRequired: json['cursorResumeRequired'] as bool,
  maxStalenessSeconds: json['maxStalenessSeconds'] as num,
  minimumScanIntervalSeconds: json['minimumScanIntervalSeconds'] as num,
  providerFailureHealthState:
      SourceProfileFreshnessGuardDtoProviderFailureHealthStateProviderFailureHealthState.fromJson(
        json['providerFailureHealthState'] as String,
      ),
  rateLimitBackoffRequired: json['rateLimitBackoffRequired'] as bool,
  scanHistoryRequired: json['scanHistoryRequired'] as bool,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  skipRecentlyScanned: json['skipRecentlyScanned'] as bool,
  staleReadModelState:
      SourceProfileFreshnessGuardDtoStaleReadModelStateStaleReadModelState.fromJson(
        json['staleReadModelState'] as String,
      ),
);

Map<String, dynamic> _$SourceProfileFreshnessGuardDtoToJson(
  SourceProfileFreshnessGuardDto instance,
) => <String, dynamic>{
  'cursorResumeRequired': instance.cursorResumeRequired,
  'maxStalenessSeconds': instance.maxStalenessSeconds,
  'minimumScanIntervalSeconds': instance.minimumScanIntervalSeconds,
  'providerFailureHealthState': instance.providerFailureHealthState,
  'rateLimitBackoffRequired': instance.rateLimitBackoffRequired,
  'scanHistoryRequired': instance.scanHistoryRequired,
  'signals': instance.signals,
  'skipRecentlyScanned': instance.skipRecentlyScanned,
  'staleReadModelState': instance.staleReadModelState,
};
