// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_reliability_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryReliabilityReportDto _$ReaderSummaryReliabilityReportDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryReliabilityReportDto(
  mode: ReaderSummaryReliabilityReportDtoModeMode.fromJson(
    json['mode'] as String,
  ),
  policyVersion: json['policyVersion'] as String,
  riskLevel: ReaderSummaryReliabilityReportDtoRiskLevelRiskLevel.fromJson(
    json['riskLevel'] as String,
  ),
  risks: (json['risks'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryReliabilityRiskDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  riskScore: json['riskScore'] as num,
);

Map<String, dynamic> _$ReaderSummaryReliabilityReportDtoToJson(
  ReaderSummaryReliabilityReportDto instance,
) => <String, dynamic>{
  'mode': instance.mode,
  'policyVersion': instance.policyVersion,
  'riskLevel': instance.riskLevel,
  'risks': instance.risks,
  'riskScore': instance.riskScore,
};
