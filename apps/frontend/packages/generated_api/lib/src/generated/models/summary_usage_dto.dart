// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'summary_usage_dto.g.dart';

@JsonSerializable()
class SummaryUsageDto {
  const SummaryUsageDto({
    required this.estimatedCostUsd,
    required this.inputTokens,
    required this.outputTokens,
  });

  factory SummaryUsageDto.fromJson(Map<String, Object?> json) =>
      _$SummaryUsageDtoFromJson(json);

  final num estimatedCostUsd;
  final num inputTokens;
  final num outputTokens;

  Map<String, Object?> toJson() => _$SummaryUsageDtoToJson(this);
}
