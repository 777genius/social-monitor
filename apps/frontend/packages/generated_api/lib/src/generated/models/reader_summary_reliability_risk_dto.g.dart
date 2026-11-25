// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_reliability_risk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryReliabilityRiskDto _$ReaderSummaryReliabilityRiskDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryReliabilityRiskDto(
  description: json['description'] as String,
  kind: ReaderSummaryReliabilityRiskDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  level: ReaderSummaryReliabilityRiskDtoLevelLevel.fromJson(
    json['level'] as String,
  ),
  score: json['score'] as num,
);

Map<String, dynamic> _$ReaderSummaryReliabilityRiskDtoToJson(
  ReaderSummaryReliabilityRiskDto instance,
) => <String, dynamic>{
  'description': instance.description,
  'kind': instance.kind,
  'level': instance.level,
  'score': instance.score,
};
