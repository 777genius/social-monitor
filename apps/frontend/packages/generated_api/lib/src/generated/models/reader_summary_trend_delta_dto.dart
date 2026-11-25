// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_trend_delta_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTrendDeltaDto {
  const ReaderSummaryTrendDeltaDto({
    required this.fadingSignals,
    required this.growingSignals,
    required this.newSignals,
    required this.repeatedSignals,
  });

  factory ReaderSummaryTrendDeltaDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTrendDeltaDtoFromJson(json);

  final List<String> fadingSignals;
  final List<String> growingSignals;
  final List<String> newSignals;
  final List<String> repeatedSignals;

  Map<String, Object?> toJson() => _$ReaderSummaryTrendDeltaDtoToJson(this);
}
