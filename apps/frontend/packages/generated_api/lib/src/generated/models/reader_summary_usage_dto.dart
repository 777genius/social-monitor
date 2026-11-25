// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_usage_dto.g.dart';

@JsonSerializable()
class ReaderSummaryUsageDto {
  const ReaderSummaryUsageDto({
    required this.estimatedCostUsd,
    required this.inputTokens,
    required this.outputTokens,
  });

  factory ReaderSummaryUsageDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryUsageDtoFromJson(json);

  final num estimatedCostUsd;
  final num? inputTokens;
  final num? outputTokens;

  Map<String, Object?> toJson() => _$ReaderSummaryUsageDtoToJson(this);
}
