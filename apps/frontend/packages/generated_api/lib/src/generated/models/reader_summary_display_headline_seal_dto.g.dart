// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_display_headline_seal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryDisplayHeadlineSealDto
_$ReaderSummaryDisplayHeadlineSealDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryDisplayHeadlineSealDto(
      headline: ReaderSummaryDisplayHeadlineDto.fromJson(
        json['headline'] as Map<String, dynamic>,
      ),
      capturedSourceDigest: json['capturedSourceDigest'] as String?,
    );

Map<String, dynamic> _$ReaderSummaryDisplayHeadlineSealDtoToJson(
  ReaderSummaryDisplayHeadlineSealDto instance,
) => <String, dynamic>{
  'capturedSourceDigest': instance.capturedSourceDigest,
  'headline': instance.headline,
};
