// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_headline_whole_input_dto_qualification_judgment_qualification_judgment.dart';

part 'reader_summary_headline_whole_input_dto.g.dart';

@JsonSerializable()
class ReaderSummaryHeadlineWholeInputDto {
  const ReaderSummaryHeadlineWholeInputDto({
    required this.bodyLength,
    required this.qualificationJudgment,
    required this.titleLength,
  });

  factory ReaderSummaryHeadlineWholeInputDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryHeadlineWholeInputDtoFromJson(json);

  final num bodyLength;
  final ReaderSummaryHeadlineWholeInputDtoQualificationJudgmentQualificationJudgment
  qualificationJudgment;
  final num titleLength;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryHeadlineWholeInputDtoToJson(this);
}
