// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_headline_reference_dto_field_field.dart';

part 'reader_summary_headline_reference_dto.g.dart';

@JsonSerializable()
class ReaderSummaryHeadlineReferenceDto {
  const ReaderSummaryHeadlineReferenceDto({
    required this.end,
    required this.field,
    required this.quote,
    required this.start,
  });

  factory ReaderSummaryHeadlineReferenceDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryHeadlineReferenceDtoFromJson(json);

  final num end;
  final ReaderSummaryHeadlineReferenceDtoFieldField field;
  final String quote;
  final num start;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryHeadlineReferenceDtoToJson(this);
}
