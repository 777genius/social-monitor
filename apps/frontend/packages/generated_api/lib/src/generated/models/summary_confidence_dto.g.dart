// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_confidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryConfidenceDto _$SummaryConfidenceDtoFromJson(
  Map<String, dynamic> json,
) => SummaryConfidenceDto(
  level: SummaryConfidenceDtoLevelLevel.fromJson(json['level'] as String),
  rationale: json['rationale'] as String,
  score: json['score'] as num,
);

Map<String, dynamic> _$SummaryConfidenceDtoToJson(
  SummaryConfidenceDto instance,
) => <String, dynamic>{
  'level': instance.level,
  'rationale': instance.rationale,
  'score': instance.score,
};
