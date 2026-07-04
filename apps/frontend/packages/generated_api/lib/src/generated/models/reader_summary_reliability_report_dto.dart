// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_reliability_report_dto_mode_mode.dart';
import 'reader_summary_reliability_report_dto_risk_level_risk_level.dart';
import 'reader_summary_reliability_risk_dto.dart';

part 'reader_summary_reliability_report_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReliabilityReportDto {
  const ReaderSummaryReliabilityReportDto({
    required this.mode,
    required this.policyVersion,
    required this.riskLevel,
    required this.risks,
    required this.riskScore,
  });

  factory ReaderSummaryReliabilityReportDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryReliabilityReportDtoFromJson(json);

  final ReaderSummaryReliabilityReportDtoModeMode mode;
  final String policyVersion;
  final ReaderSummaryReliabilityReportDtoRiskLevelRiskLevel riskLevel;
  final List<ReaderSummaryReliabilityRiskDto> risks;
  final num riskScore;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryReliabilityReportDtoToJson(this);
}
