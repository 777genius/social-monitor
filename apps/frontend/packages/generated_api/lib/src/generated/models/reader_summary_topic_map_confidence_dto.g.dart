// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_map_confidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicMapConfidenceDto _$ReaderSummaryTopicMapConfidenceDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicMapConfidenceDto(
  level: ReaderSummaryTopicMapConfidenceDtoLevelLevel.fromJson(
    json['level'] as String,
  ),
  rationale: json['rationale'] as String,
  score: json['score'] as num,
);

Map<String, dynamic> _$ReaderSummaryTopicMapConfidenceDtoToJson(
  ReaderSummaryTopicMapConfidenceDto instance,
) => <String, dynamic>{
  'level': instance.level,
  'rationale': instance.rationale,
  'score': instance.score,
};
