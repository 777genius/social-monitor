// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_overview_degradation_reason_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingOverviewDegradationReasonResponseDto
_$SourceBindingOverviewDegradationReasonResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingOverviewDegradationReasonResponseDto(
  affectedBindings: json['affectedBindings'] as num,
  code: SourceBindingOverviewDegradationReasonResponseDtoCodeCode.fromJson(
    json['code'] as String,
  ),
  operatorAction: json['operatorAction'] as String,
  sampleSourceBindingIds: (json['sampleSourceBindingIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  severity:
      SourceBindingOverviewDegradationReasonResponseDtoSeveritySeverity.fromJson(
        json['severity'] as String,
      ),
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  nextEligibleAt: json['nextEligibleAt'] == null
      ? null
      : DateTime.parse(json['nextEligibleAt'] as String),
);

Map<String, dynamic> _$SourceBindingOverviewDegradationReasonResponseDtoToJson(
  SourceBindingOverviewDegradationReasonResponseDto instance,
) => <String, dynamic>{
  'affectedBindings': instance.affectedBindings,
  'code': instance.code,
  'nextEligibleAt': instance.nextEligibleAt?.toIso8601String(),
  'operatorAction': instance.operatorAction,
  'sampleSourceBindingIds': instance.sampleSourceBindingIds,
  'severity': instance.severity,
  'signals': instance.signals,
};
