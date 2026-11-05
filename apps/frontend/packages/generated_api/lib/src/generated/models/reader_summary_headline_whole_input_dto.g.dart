// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_headline_whole_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryHeadlineWholeInputDto _$ReaderSummaryHeadlineWholeInputDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryHeadlineWholeInputDto(
  bodyLength: json['bodyLength'] as num,
  qualificationJudgment:
      ReaderSummaryHeadlineWholeInputDtoQualificationJudgmentQualificationJudgment.fromJson(
        json['qualificationJudgment'] as String,
      ),
  titleLength: json['titleLength'] as num,
);

Map<String, dynamic> _$ReaderSummaryHeadlineWholeInputDtoToJson(
  ReaderSummaryHeadlineWholeInputDto instance,
) => <String, dynamic>{
  'bodyLength': instance.bodyLength,
  'qualificationJudgment': instance.qualificationJudgment,
  'titleLength': instance.titleLength,
};
