// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_confidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryConfidenceDto _$ReaderSummaryConfidenceDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryConfidenceDto(
  level: ReaderSummaryConfidenceDtoLevelLevel.fromJson(json['level'] as String),
  rationale: json['rationale'] as String,
  score: json['score'] as num,
);

Map<String, dynamic> _$ReaderSummaryConfidenceDtoToJson(
  ReaderSummaryConfidenceDto instance,
) => <String, dynamic>{
  'level': instance.level,
  'rationale': instance.rationale,
  'score': instance.score,
};
