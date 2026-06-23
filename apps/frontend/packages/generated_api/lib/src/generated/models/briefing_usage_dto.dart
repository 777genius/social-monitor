// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_usage_dto.g.dart';

@JsonSerializable()
class BriefingUsageDto {
  const BriefingUsageDto({
    required this.estimatedCostUsd,
    required this.inputTokens,
    required this.outputTokens,
  });

  factory BriefingUsageDto.fromJson(Map<String, Object?> json) =>
      _$BriefingUsageDtoFromJson(json);

  final num estimatedCostUsd;
  final num inputTokens;
  final num outputTokens;

  Map<String, Object?> toJson() => _$BriefingUsageDtoToJson(this);
}
