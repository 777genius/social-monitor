// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_explanation_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthExplanationResponseDto
_$SourceBindingHealthExplanationResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingHealthExplanationResponseDto(
  message: json['message'] as String,
  operatorAction: json['operatorAction'] as String,
  reasonCode:
      SourceBindingHealthExplanationResponseDtoReasonCodeReasonCode.fromJson(
        json['reasonCode'] as String,
      ),
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  staleBySeconds: json['staleBySeconds'] as num?,
  unavailableUntil: json['unavailableUntil'] == null
      ? null
      : DateTime.parse(json['unavailableUntil'] as String),
);

Map<String, dynamic> _$SourceBindingHealthExplanationResponseDtoToJson(
  SourceBindingHealthExplanationResponseDto instance,
) => <String, dynamic>{
  'message': instance.message,
  'operatorAction': instance.operatorAction,
  'reasonCode': instance.reasonCode,
  'signals': instance.signals,
  'staleBySeconds': instance.staleBySeconds,
  'unavailableUntil': instance.unavailableUntil?.toIso8601String(),
};
