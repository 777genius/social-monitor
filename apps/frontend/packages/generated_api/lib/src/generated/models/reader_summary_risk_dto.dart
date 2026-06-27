// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_risk_dto_reason_reason.dart';

part 'reader_summary_risk_dto.g.dart';

@JsonSerializable()
class ReaderSummaryRiskDto {
  const ReaderSummaryRiskDto({
    required this.description,
    this.citationIds,
    this.reason,
  });

  factory ReaderSummaryRiskDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryRiskDtoFromJson(json);

  final List<String>? citationIds;
  final String description;
  final ReaderSummaryRiskDtoReasonReason? reason;

  Map<String, Object?> toJson() => _$ReaderSummaryRiskDtoToJson(this);
}
