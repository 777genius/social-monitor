// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_risk_dto_reason_reason.dart';

part 'briefing_risk_dto.g.dart';

@JsonSerializable()
class BriefingRiskDto {
  const BriefingRiskDto({
    required this.description,
    this.citationIds,
    this.reason,
  });

  factory BriefingRiskDto.fromJson(Map<String, Object?> json) =>
      _$BriefingRiskDtoFromJson(json);

  final List<String>? citationIds;
  final String description;
  final BriefingRiskDtoReasonReason? reason;

  Map<String, Object?> toJson() => _$BriefingRiskDtoToJson(this);
}
