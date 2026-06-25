// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_recent_window_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthRecentWindowResponseDto
_$SourceBindingHealthRecentWindowResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingHealthRecentWindowResponseDto(
  activeScans: json['activeScans'] as num,
  consecutiveFailures: json['consecutiveFailures'] as num,
  failedScans: json['failedScans'] as num,
  operatorAction: json['operatorAction'] as String,
  providerHealthState:
      SourceBindingHealthRecentWindowResponseDtoProviderHealthStateProviderHealthState.fromJson(
        json['providerHealthState'] as String,
      ),
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitedScans: json['rateLimitedScans'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  succeededScans: json['succeededScans'] as num,
  totalScans: json['totalScans'] as num,
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
  lastFailedAt: json['lastFailedAt'] == null
      ? null
      : DateTime.parse(json['lastFailedAt'] as String),
  lastSucceededAt: json['lastSucceededAt'] == null
      ? null
      : DateTime.parse(json['lastSucceededAt'] as String),
);

Map<String, dynamic> _$SourceBindingHealthRecentWindowResponseDtoToJson(
  SourceBindingHealthRecentWindowResponseDto instance,
) => <String, dynamic>{
  'activeScans': instance.activeScans,
  'consecutiveFailures': instance.consecutiveFailures,
  'failedScans': instance.failedScans,
  'lastFailedAt': instance.lastFailedAt?.toIso8601String(),
  'lastSucceededAt': instance.lastSucceededAt?.toIso8601String(),
  'operatorAction': instance.operatorAction,
  'providerHealthState': instance.providerHealthState,
  'providerUnavailableScans': instance.providerUnavailableScans,
  'rateLimitedScans': instance.rateLimitedScans,
  'signals': instance.signals,
  'succeededScans': instance.succeededScans,
  'totalScans': instance.totalScans,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
