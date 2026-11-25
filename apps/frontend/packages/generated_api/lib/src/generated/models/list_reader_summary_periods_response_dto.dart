// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_period_summary_dto.dart';

part 'list_reader_summary_periods_response_dto.g.dart';

@JsonSerializable()
class ListReaderSummaryPeriodsResponseDto {
  const ListReaderSummaryPeriodsResponseDto({
    required this.items,
    this.nextCursor,
  });

  factory ListReaderSummaryPeriodsResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ListReaderSummaryPeriodsResponseDtoFromJson(json);

  final List<ReaderSummaryPeriodSummaryDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() =>
      _$ListReaderSummaryPeriodsResponseDtoToJson(this);
}
