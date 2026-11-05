// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_display_headline_dto_kind_kind.dart';
import 'reader_summary_display_headline_dto_status_status.dart';
import 'reader_summary_headline_binding_dto.dart';
import 'reader_summary_headline_qualification_dto.dart';
import 'reader_summary_headline_reference_dto.dart';
import 'reader_summary_headline_whole_input_dto.dart';

part 'reader_summary_display_headline_dto.g.dart';

@JsonSerializable()
class ReaderSummaryDisplayHeadlineDto {
  const ReaderSummaryDisplayHeadlineDto({
    required this.status,
    this.binding,
    this.confidence,
    this.kind,
    this.qualifications,
    this.reasonCode,
    this.support,
    this.text,
    this.wholeInput,
  });

  factory ReaderSummaryDisplayHeadlineDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryDisplayHeadlineDtoFromJson(json);

  final ReaderSummaryHeadlineBindingDto? binding;
  final num? confidence;
  final ReaderSummaryDisplayHeadlineDtoKindKind? kind;
  final List<ReaderSummaryHeadlineQualificationDto>? qualifications;
  final String? reasonCode;
  final ReaderSummaryDisplayHeadlineDtoStatusStatus status;
  final List<ReaderSummaryHeadlineReferenceDto>? support;
  final String? text;
  final ReaderSummaryHeadlineWholeInputDto? wholeInput;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryDisplayHeadlineDtoToJson(this);
}
