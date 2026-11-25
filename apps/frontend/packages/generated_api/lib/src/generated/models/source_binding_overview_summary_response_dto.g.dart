// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_overview_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingOverviewSummaryResponseDto
_$SourceBindingOverviewSummaryResponseDtoFromJson(Map<String, dynamic> json) =>
    SourceBindingOverviewSummaryResponseDto(
      attentionRequiredBindings: json['attentionRequiredBindings'] as num,
      authFailedBindings: json['authFailedBindings'] as num,
      canScanNowBindings: json['canScanNowBindings'] as num,
      degradationReasons: (json['degradationReasons'] as List<dynamic>)
          .map(
            (e) => SourceBindingOverviewDegradationReasonResponseDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      degradedBindings: json['degradedBindings'] as num,
      downBindings: json['downBindings'] as num,
      freshSuccessSkips: json['freshSuccessSkips'] as num,
      healthyBindings: json['healthyBindings'] as num,
      notConfiguredBindings: json['notConfiguredBindings'] as num,
      operatorAction: json['operatorAction'] as String,
      pausedBindings: json['pausedBindings'] as num,
      providerBreakdown: (json['providerBreakdown'] as List<dynamic>)
          .map(
            (e) => SourceBindingOverviewProviderBreakdownResponseDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      providerFailureBackoffSkips: json['providerFailureBackoffSkips'] as num,
      providerUnavailableScans: json['providerUnavailableScans'] as num,
      rateLimitedBindings: json['rateLimitedBindings'] as num,
      scanningBindings: json['scanningBindings'] as num,
      scheduledBindings: json['scheduledBindings'] as num,
      signals: (json['signals'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      staleBindings: json['staleBindings'] as num,
      totalBindings: json['totalBindings'] as num,
      unsupportedScopeBindings: json['unsupportedScopeBindings'] as num,
      nextEligibleAt: json['nextEligibleAt'] == null
          ? null
          : DateTime.parse(json['nextEligibleAt'] as String),
    );

Map<String, dynamic> _$SourceBindingOverviewSummaryResponseDtoToJson(
  SourceBindingOverviewSummaryResponseDto instance,
) => <String, dynamic>{
  'attentionRequiredBindings': instance.attentionRequiredBindings,
  'authFailedBindings': instance.authFailedBindings,
  'canScanNowBindings': instance.canScanNowBindings,
  'degradationReasons': instance.degradationReasons,
  'degradedBindings': instance.degradedBindings,
  'downBindings': instance.downBindings,
  'freshSuccessSkips': instance.freshSuccessSkips,
  'healthyBindings': instance.healthyBindings,
  'nextEligibleAt': instance.nextEligibleAt?.toIso8601String(),
  'notConfiguredBindings': instance.notConfiguredBindings,
  'operatorAction': instance.operatorAction,
  'pausedBindings': instance.pausedBindings,
  'providerBreakdown': instance.providerBreakdown,
  'providerFailureBackoffSkips': instance.providerFailureBackoffSkips,
  'providerUnavailableScans': instance.providerUnavailableScans,
  'rateLimitedBindings': instance.rateLimitedBindings,
  'scanningBindings': instance.scanningBindings,
  'scheduledBindings': instance.scheduledBindings,
  'signals': instance.signals,
  'staleBindings': instance.staleBindings,
  'totalBindings': instance.totalBindings,
  'unsupportedScopeBindings': instance.unsupportedScopeBindings,
};
