// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_overview_provider_breakdown_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingOverviewProviderBreakdownResponseDto
_$SourceBindingOverviewProviderBreakdownResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingOverviewProviderBreakdownResponseDto(
  canScanNowBindings: json['canScanNowBindings'] as num,
  degradedBindings: json['degradedBindings'] as num,
  downBindings: json['downBindings'] as num,
  freshSuccessSkips: json['freshSuccessSkips'] as num,
  healthyBindings: json['healthyBindings'] as num,
  notConfiguredBindings: json['notConfiguredBindings'] as num,
  pausedBindings: json['pausedBindings'] as num,
  providerFailureBackoffSkips: json['providerFailureBackoffSkips'] as num,
  providerKey: json['providerKey'] as String,
  providerUnavailableScans: json['providerUnavailableScans'] as num,
  rateLimitBackoffSkips: json['rateLimitBackoffSkips'] as num,
  scanningBindings: json['scanningBindings'] as num,
  scheduledBindings: json['scheduledBindings'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  staleBindings: json['staleBindings'] as num,
  totalBindings: json['totalBindings'] as num,
  nextEligibleAt: json['nextEligibleAt'] == null
      ? null
      : DateTime.parse(json['nextEligibleAt'] as String),
);

Map<String, dynamic> _$SourceBindingOverviewProviderBreakdownResponseDtoToJson(
  SourceBindingOverviewProviderBreakdownResponseDto instance,
) => <String, dynamic>{
  'canScanNowBindings': instance.canScanNowBindings,
  'degradedBindings': instance.degradedBindings,
  'downBindings': instance.downBindings,
  'freshSuccessSkips': instance.freshSuccessSkips,
  'healthyBindings': instance.healthyBindings,
  'nextEligibleAt': instance.nextEligibleAt?.toIso8601String(),
  'notConfiguredBindings': instance.notConfiguredBindings,
  'pausedBindings': instance.pausedBindings,
  'providerFailureBackoffSkips': instance.providerFailureBackoffSkips,
  'providerKey': instance.providerKey,
  'providerUnavailableScans': instance.providerUnavailableScans,
  'rateLimitBackoffSkips': instance.rateLimitBackoffSkips,
  'scanningBindings': instance.scanningBindings,
  'scheduledBindings': instance.scheduledBindings,
  'signals': instance.signals,
  'staleBindings': instance.staleBindings,
  'totalBindings': instance.totalBindings,
};
