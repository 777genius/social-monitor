// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_confidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingConfidenceDto _$BriefingConfidenceDtoFromJson(
  Map<String, dynamic> json,
) => BriefingConfidenceDto(
  level: BriefingConfidenceDtoLevelLevel.fromJson(json['level'] as String),
  rationale: json['rationale'] as String,
  score: json['score'] as num,
);

Map<String, dynamic> _$BriefingConfidenceDtoToJson(
  BriefingConfidenceDto instance,
) => <String, dynamic>{
  'level': instance.level,
  'rationale': instance.rationale,
  'score': instance.score,
};
