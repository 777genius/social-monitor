// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_headline_reference_dto.dart';

part 'reader_summary_headline_qualification_dto.g.dart';

@JsonSerializable()
class ReaderSummaryHeadlineQualificationDto {
  const ReaderSummaryHeadlineQualificationDto({
    required this.evidence,
    required this.phrase,
  });

  factory ReaderSummaryHeadlineQualificationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryHeadlineQualificationDtoFromJson(json);

  final List<ReaderSummaryHeadlineReferenceDto> evidence;
  final String phrase;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryHeadlineQualificationDtoToJson(this);
}
