// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_daily_history_scheduler_skip_breakdown_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingDailyHistorySchedulerSkipBreakdownResponseDto
_$SourceBindingDailyHistorySchedulerSkipBreakdownResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingDailyHistorySchedulerSkipBreakdownResponseDto(
  activeScan: json['activeScan'] as num,
  duplicateWindow: json['duplicateWindow'] as num,
  freshSuccess: json['freshSuccess'] as num,
  providerFailureBackoff: json['providerFailureBackoff'] as num,
  queueBackpressure: json['queueBackpressure'] as num,
  rateLimitBackoff: json['rateLimitBackoff'] as num,
  sourceUnavailable: json['sourceUnavailable'] as num,
);

Map<String, dynamic>
_$SourceBindingDailyHistorySchedulerSkipBreakdownResponseDtoToJson(
  SourceBindingDailyHistorySchedulerSkipBreakdownResponseDto instance,
) => <String, dynamic>{
  'activeScan': instance.activeScan,
  'duplicateWindow': instance.duplicateWindow,
  'freshSuccess': instance.freshSuccess,
  'providerFailureBackoff': instance.providerFailureBackoff,
  'queueBackpressure': instance.queueBackpressure,
  'rateLimitBackoff': instance.rateLimitBackoff,
  'sourceUnavailable': instance.sourceUnavailable,
};
