// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_overview_degradation_reason_response_dto_code_code.dart';
import 'source_binding_overview_degradation_reason_response_dto_severity_severity.dart';

part 'source_binding_overview_degradation_reason_response_dto.g.dart';

@JsonSerializable()
class SourceBindingOverviewDegradationReasonResponseDto {
  const SourceBindingOverviewDegradationReasonResponseDto({
    required this.affectedBindings,
    required this.code,
    required this.operatorAction,
    required this.sampleSourceBindingIds,
    required this.severity,
    required this.signals,
    this.nextEligibleAt,
  });

  factory SourceBindingOverviewDegradationReasonResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingOverviewDegradationReasonResponseDtoFromJson(json);

  final num affectedBindings;
  final SourceBindingOverviewDegradationReasonResponseDtoCodeCode code;
  final DateTime? nextEligibleAt;
  final String operatorAction;
  final List<String> sampleSourceBindingIds;
  final SourceBindingOverviewDegradationReasonResponseDtoSeveritySeverity
  severity;
  final List<String> signals;

  Map<String, Object?> toJson() =>
      _$SourceBindingOverviewDegradationReasonResponseDtoToJson(this);
}
