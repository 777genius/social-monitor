// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_reader_quality_state_dto_flags_flags.dart';
import 'reader_summary_reader_quality_state_dto_status_status.dart';

part 'reader_summary_reader_quality_state_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReaderQualityStateDto {
  const ReaderSummaryReaderQualityStateDto({
    required this.flags,
    required this.isSingleSource,
    required this.status,
    required this.warnings,
  });

  factory ReaderSummaryReaderQualityStateDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryReaderQualityStateDtoFromJson(json);

  final List<ReaderSummaryReaderQualityStateDtoFlagsFlags> flags;
  final bool isSingleSource;
  final ReaderSummaryReaderQualityStateDtoStatusStatus status;
  final List<String> warnings;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryReaderQualityStateDtoToJson(this);
}
