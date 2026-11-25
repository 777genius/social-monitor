// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'list_reader_summaries_response_dto.dart';
import 'list_reader_summary_periods_response_dto.dart';

part 'reader_summary_bootstrap_response_dto.g.dart';

@JsonSerializable()
class ReaderSummaryBootstrapResponseDto {
  const ReaderSummaryBootstrapResponseDto({
    required this.latest,
    required this.periods,
    required this.tenantId,
    required this.workspaceId,
  });

  factory ReaderSummaryBootstrapResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryBootstrapResponseDtoFromJson(json);

  final ListReaderSummariesResponseDto latest;
  final ListReaderSummaryPeriodsResponseDto periods;
  final String tenantId;
  final String workspaceId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryBootstrapResponseDtoToJson(this);
}
