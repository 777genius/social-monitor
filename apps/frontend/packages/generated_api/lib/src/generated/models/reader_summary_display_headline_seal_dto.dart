// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_display_headline_dto.dart';

part 'reader_summary_display_headline_seal_dto.g.dart';

@JsonSerializable()
class ReaderSummaryDisplayHeadlineSealDto {
  const ReaderSummaryDisplayHeadlineSealDto({
    required this.headline,
    this.capturedSourceDigest,
  });

  factory ReaderSummaryDisplayHeadlineSealDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryDisplayHeadlineSealDtoFromJson(json);

  final String? capturedSourceDigest;
  final ReaderSummaryDisplayHeadlineDto headline;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryDisplayHeadlineSealDtoToJson(this);
}
