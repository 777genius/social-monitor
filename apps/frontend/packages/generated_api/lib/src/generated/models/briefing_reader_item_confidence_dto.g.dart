// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_reader_item_confidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingReaderItemConfidenceDto _$BriefingReaderItemConfidenceDtoFromJson(
  Map<String, dynamic> json,
) => BriefingReaderItemConfidenceDto(
  level: BriefingReaderItemConfidenceDtoLevelLevel.fromJson(
    json['level'] as String,
  ),
  rationale: json['rationale'] as String,
  score: json['score'] as num,
);

Map<String, dynamic> _$BriefingReaderItemConfidenceDtoToJson(
  BriefingReaderItemConfidenceDto instance,
) => <String, dynamic>{
  'level': instance.level,
  'rationale': instance.rationale,
  'score': instance.score,
};
