// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_headline_qualification_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryHeadlineQualificationDto
_$ReaderSummaryHeadlineQualificationDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryHeadlineQualificationDto(
      evidence: (json['evidence'] as List<dynamic>)
          .map(
            (e) => ReaderSummaryHeadlineReferenceDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      phrase: json['phrase'] as String,
    );

Map<String, dynamic> _$ReaderSummaryHeadlineQualificationDtoToJson(
  ReaderSummaryHeadlineQualificationDto instance,
) => <String, dynamic>{
  'evidence': instance.evidence,
  'phrase': instance.phrase,
};
