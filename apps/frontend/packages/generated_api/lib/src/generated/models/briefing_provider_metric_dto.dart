// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_provider_metric_dto.g.dart';

@JsonSerializable()
class BriefingProviderMetricDto {
  const BriefingProviderMetricDto({required this.label, required this.value});

  factory BriefingProviderMetricDto.fromJson(Map<String, Object?> json) =>
      _$BriefingProviderMetricDtoFromJson(json);

  final String label;
  final String value;

  Map<String, Object?> toJson() => _$BriefingProviderMetricDtoToJson(this);
}
