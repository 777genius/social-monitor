// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_health_explanation_response_dto_reason_code_reason_code.dart';

part 'source_binding_health_explanation_response_dto.g.dart';

@JsonSerializable()
class SourceBindingHealthExplanationResponseDto {
  const SourceBindingHealthExplanationResponseDto({
    required this.message,
    required this.operatorAction,
    required this.reasonCode,
    required this.signals,
    this.staleBySeconds,
    this.unavailableUntil,
  });

  factory SourceBindingHealthExplanationResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingHealthExplanationResponseDtoFromJson(json);

  final String message;
  final String operatorAction;
  final SourceBindingHealthExplanationResponseDtoReasonCodeReasonCode
  reasonCode;
  final List<String> signals;
  final num? staleBySeconds;
  final DateTime? unavailableUntil;

  Map<String, Object?> toJson() =>
      _$SourceBindingHealthExplanationResponseDtoToJson(this);
}
