// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_risk_dto_reason_reason.dart';

part 'summary_risk_dto.g.dart';

@JsonSerializable()
class SummaryRiskDto {
  const SummaryRiskDto({
    required this.description,
    this.citationIds,
    this.reason,
  });

  factory SummaryRiskDto.fromJson(Map<String, Object?> json) =>
      _$SummaryRiskDtoFromJson(json);

  final List<String>? citationIds;
  final String description;
  final SummaryRiskDtoReasonReason? reason;

  Map<String, Object?> toJson() => _$SummaryRiskDtoToJson(this);
}
