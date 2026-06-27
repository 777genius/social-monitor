// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_observed_at_range_dto.g.dart';

@JsonSerializable()
class ReaderSummaryObservedAtRangeDto {
  const ReaderSummaryObservedAtRangeDto({
    required this.endedAt,
    required this.startedAt,
  });

  factory ReaderSummaryObservedAtRangeDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryObservedAtRangeDtoFromJson(json);

  final DateTime endedAt;
  final DateTime startedAt;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryObservedAtRangeDtoToJson(this);
}
