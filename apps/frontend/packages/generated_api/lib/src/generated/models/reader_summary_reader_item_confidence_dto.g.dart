// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_reader_item_confidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryReaderItemConfidenceDto
_$ReaderSummaryReaderItemConfidenceDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryReaderItemConfidenceDto(
      level: ReaderSummaryReaderItemConfidenceDtoLevelLevel.fromJson(
        json['level'] as String,
      ),
      rationale: json['rationale'] as String,
      score: json['score'] as num,
    );

Map<String, dynamic> _$ReaderSummaryReaderItemConfidenceDtoToJson(
  ReaderSummaryReaderItemConfidenceDto instance,
) => <String, dynamic>{
  'level': instance.level,
  'rationale': instance.rationale,
  'score': instance.score,
};
